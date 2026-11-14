import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import UserAvatar from "@/components/chat/UserAvatar";
import { documentService } from "@/services/documentService";
import { DOCUMENT_ACCEPT, formatFileSize, validateDocumentFile } from "@/lib/messageFile";
import { cn } from "@/lib/utils";
import type { SharedDocument, SharedDocumentLimits } from "@/types/document";

// còn tài liệu đang xử lý thì hỏi lại server mỗi chừng này
const POLL_MS = 5_000;

const errorMessage = (error: unknown, fallback: string) =>
  (axios.isAxiosError(error) ? (error.response?.data?.message as string | undefined) : undefined) ?? fallback;

const dateFormat = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

const StatusBadge = ({ doc }: { doc: SharedDocument }) => {
  if (doc.status === "ready") {
    return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Sẵn sàng</Badge>;
  }
  if (doc.status === "unreadable") {
    return (
      <Badge variant="destructive">
        {doc.textStatus === "empty" ? "Không có chữ (bản scan)" : "Không đọc được file"}
      </Badge>
    );
  }
  const { total, embedded } = doc.chunks;
  return (
    <Badge variant="secondary" className="gap-1">
      <Loader2 className="size-3 animate-spin" />
      {total > 0 ? `Đang xử lý ${embedded}/${total} đoạn` : "Đang xử lý"}
    </Badge>
  );
};

// Tài liệu dài chỉ được index phần đầu: nói rõ cho người dùng
const truncatedNote = (doc: SharedDocument, limits: SharedDocumentLimits | null) => {
  if (!doc.indexTruncated || doc.status === "unreadable") return null;
  if (doc.indexedUntilPage) return `Komi AI chỉ tìm được ${doc.indexedUntilPage} trang đầu`;
  const chars = limits?.maxIndexChars.toLocaleString("vi-VN") ?? "50.000";
  return `Komi AI chỉ tìm được ${chars} ký tự đầu`;
};

const DocumentsPanel = () => {
  const [documents, setDocuments] = useState<SharedDocument[]>([]);
  const [limits, setLimits] = useState<SharedDocumentLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Tải danh sách khi mở trang; còn tài liệu đang xử lý (worker chạy nền ở backend) thì hỏi lại mỗi POLL_MS
  const hasProcessing = documents.some((d) => d.status === "processing");
  useEffect(() => {
    let active = true;
    const fetchList = () =>
      documentService
        .list()
        .then((data) => {
          if (!active) return;
          setDocuments(data.documents);
          setLimits(data.limits);
        })
        .catch((error) => active && toast.error(errorMessage(error, "Không tải được danh sách tài liệu")))
        .finally(() => active && setLoading(false));

    fetchList();
    const timer = hasProcessing ? setInterval(fetchList, POLL_MS) : undefined;
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [hasProcessing]);

  const handleFile = async (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = ""; // chọn lại cùng file vẫn chạy
    if (!file) return;
    const invalid = validateDocumentFile(file);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setUploading(true);
    try {
      const doc = await documentService.upload(file);
      setDocuments((prev) => [doc, ...prev]);
      toast.success(`Đã tải lên ${doc.name}`);
    } catch (error) {
      toast.error(errorMessage(error, "Tải tài liệu không thành công"));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: SharedDocument) => {
    if (!window.confirm(`Xoá "${doc.name}" khỏi kho tài liệu chung? Không hoàn tác được.`)) return;
    setDeletingId(doc._id);
    try {
      await documentService.remove(doc._id);
      setDocuments((prev) => prev.filter((d) => d._id !== doc._id));
    } catch (error) {
      toast.error(errorMessage(error, "Xoá tài liệu không thành công"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <SidebarInset className="flex flex-col h-full flex-1 overflow-hidden rounded-sm shadow-md">
      <header className="sticky top-0 z-10 px-4 py-2 flex items-center gap-2 bg-background">
        <SidebarTrigger className="-ml-1 text-foreground" />
        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        <FileText className="size-4 text-primary" />
        <h2 className="font-semibold">Tài liệu chung</h2>
        <div className="ml-auto">
          <input
            ref={inputRef}
            type="file"
            accept={DOCUMENT_ACCEPT}
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <Button size="lg" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
            {uploading ? "Đang tải lên..." : "Tải tài liệu lên"}
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-primary-foreground p-4">
        <p className="text-sm text-muted-foreground mb-4">
          Mọi người trong Komi đều xem và tải được tài liệu ở đây; Komi AI dùng chúng để trả lời câu hỏi. File PDF hoặc
          Word (.docx), tối đa 10MB
          {limits ? `, ${limits.dailyUploads} tài liệu mỗi người mỗi ngày` : ""}. Chỉ người tải lên mới xoá được.
        </p>

        {loading ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FileText className="size-10 mx-auto mb-3 opacity-50" />
            <p>Chưa có tài liệu nào. Tải lên quy định, hướng dẫn, biểu mẫu... để cả nhóm cùng tra cứu.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {documents.map((doc) => {
              const note = truncatedNote(doc, limits);
              return (
                <li
                  key={doc._id}
                  className={cn(
                    "glass rounded-lg p-3 flex items-center gap-3",
                    deletingId === doc._id && "opacity-50"
                  )}
                >
                  <div className="size-10 shrink-0 rounded-md bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold uppercase">
                    {doc.kind}
                  </div>

                  <div className="flex-1 min-w-0">
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-sm truncate block hover:underline"
                      title={doc.name}
                    >
                      {doc.name}
                    </a>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground mt-1">
                      {doc.uploader && (
                        <span className="flex items-center gap-1">
                          <UserAvatar
                            type="mini"
                            name={doc.uploader.displayName}
                            avatarUrl={doc.uploader.avatarUrl ?? undefined}
                            className="ring-0"
                          />
                          {doc.uploader.displayName}
                        </span>
                      )}
                      <span>· {dateFormat.format(new Date(doc.createdAt))}</span>
                      <span>· {formatFileSize(doc.size)}</span>
                      <StatusBadge doc={doc} />
                      {note && <span className="text-amber-600 dark:text-amber-400">{note}</span>}
                    </div>
                  </div>

                  {doc.canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Xoá ${doc.name}`}
                      title="Xoá"
                      onClick={() => handleDelete(doc)}
                      disabled={deletingId === doc._id}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SidebarInset>
  );
};

export default DocumentsPanel;
