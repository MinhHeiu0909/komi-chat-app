import { DropdownMenuItem } from "../ui/dropdown-menu";
import { useAuthStore } from "@/stores/useAuthStore";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router";

// Mục "Đăng xuất" trong menu tài khoản; rê chuột / chọn bằng phím thì nền đỏ hẳn
const Logout = () => {
  const { signOut } = useAuthStore();
  const navigate = useNavigate();
  const handleLogout = async () => {
    try {
      await signOut();
      navigate("/signin");
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <DropdownMenuItem
      variant="destructive"
      onClick={handleLogout}
      className="min-h-10 cursor-pointer gap-3 rounded-lg px-3 text-sm [&_svg]:size-[18px]! focus:bg-destructive! focus:text-white! focus:*:[svg]:text-white! dark:focus:bg-destructive!"
    >
      <LogOut />
      Đăng xuất
    </DropdownMenuItem>
  );
};

export default Logout;
