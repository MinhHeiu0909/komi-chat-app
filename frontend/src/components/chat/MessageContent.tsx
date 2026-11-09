import { memo, useState, type ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

// GFM: bảng, gạch ngang, link tự nhận; breaks: một lần Enter = xuống dòng như chat
const remarkPlugins = [remarkGfm, remarkBreaks];

const CodeBlock = ({ children, ...props }: ComponentProps<"pre">) => {
  const [copied, setCopied] = useState(false);

  const copy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const text = e.currentTarget.parentElement?.querySelector("code")?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Không sao chép được");
    }
  };

  return (
    <div className="chat-code-block group/code relative">
      <pre {...props}>{children}</pre>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Đã sao chép" : "Sao chép code"}
        title={copied ? "Đã sao chép" : "Sao chép"}
        className="absolute right-1.5 top-1.5 rounded-md p-1 opacity-0 transition-opacity hover:bg-current/15 group-hover/code:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
};

// react-markdown truyền thêm prop `node` (cây cú pháp); bỏ đi trước khi đưa xuống thẻ DOM
const withoutNode = <P extends { node?: unknown }>(props: P) => {
  const rest = { ...props };
  delete rest.node;
  return rest;
};

const components: Components = {
  pre: (props) => <CodeBlock {...withoutNode(props)} />,
  // link bị chặn (vd. javascript:) sẽ có href rỗng: hiện thành chữ thường
  a: (props) =>
    props.href ? (
      <a {...withoutNode(props)} target="_blank" rel="noopener noreferrer nofollow" />
    ) : (
      <span>{props.children}</span>
    ),
  // Ảnh trong markdown có thể tải từ bất kỳ đâu (lộ IP người xem) nên không tải,
  // chỉ hiện chữ mô tả. HTML thô thì react-markdown tự hiện thành chữ, không chạy.
  img: ({ alt }) => <span className="opacity-80">[ảnh{alt ? `: ${alt}` : ""}]</span>,
  table: (props) => (
    <div className="chat-table-wrap">
      <table {...withoutNode(props)} />
    </div>
  ),
};

interface MessageContentProps {
  content: string;
}

// memo: tránh parse lại markdown mỗi lần store đổi (typing, reaction của tin khác...)
const MessageContent = memo(({ content }: MessageContentProps) => (
  <div className="chat-markdown text-sm leading-relaxed">
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      components={components}
    >
      {content}
    </ReactMarkdown>
  </div>
));

export default MessageContent;
