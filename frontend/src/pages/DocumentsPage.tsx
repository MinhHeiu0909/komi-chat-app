import DocumentsPanel from "@/components/documents/DocumentsPanel";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

// Kho tài liệu chung: cùng bố cục với trang chat, khung bên phải là danh sách tài liệu
const DocumentsPage = () => {
  return (
    <SidebarProvider>
      <AppSidebar />

      <div className="flex h-screen w-full p-2">
        <DocumentsPanel />
      </div>
    </SidebarProvider>
  );
};

export default DocumentsPage;
