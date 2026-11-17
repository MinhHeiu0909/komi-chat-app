import AiUsagePanel from "@/components/admin/AiUsagePanel";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

// Chi phí AI (chỉ admin): cùng bố cục với trang Tài liệu chung
const AiUsagePage = () => {
  return (
    <SidebarProvider>
      <AppSidebar />

      <div className="flex h-screen w-full p-2">
        <AiUsagePanel />
      </div>
    </SidebarProvider>
  );
};

export default AiUsagePage;
