import type { FieldErrors, UseFormRegister } from "react-hook-form";
import type { IFormValues } from "../chat/AddFriendModal";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { DialogFooter } from "../ui/dialog";
// import { DialogClose } from "@radix-ui/react-dialog";
import { Button } from "../ui/button";
import { Search } from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";

interface SearchFormProps {
  register: UseFormRegister<IFormValues>;
  errors: FieldErrors<IFormValues>;
  loading: boolean;
  usernameValue: string;
  isFound: boolean | null;
  searchedUsername: string;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

const SearchForm = ({
  register,
  errors,
  usernameValue,
  loading,
  isFound,
  searchedUsername,
  onSubmit,
  onCancel,
}: SearchFormProps) => {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="username" className="text-sm font-medium">
          Username
        </Label>

        {/* chữ @ cố định ở đầu ô để người dùng biết cần gõ username, không phải tên hiển thị */}
        <div className="relative">
          <span
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          >
            @
          </span>
          <Input
            id="username"
            placeholder="vd. binh"
            autoComplete="off"
            className="h-11 pl-8 pr-3.5 text-sm md:text-sm"
            aria-invalid={Boolean(errors.username) || isFound === false || undefined}
            {...register("username", {
              required: "Username không được bỏ trống",
            })}
          />
        </div>
        {errors.username && (
          <p className="error-message">{errors.username.message}</p>
        )}

        {isFound === false && (
          <p className="error-message">
            Không tìm thấy <span className="font-semibold">@{searchedUsername}</span>. Kiểm tra lại chính tả rồi thử lại.
          </p>
        )}
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        <Dialog.Close
          render={
            <Button
              type="button"
              variant="outline"
              className="h-10 flex-1 hover:border-destructive hover:bg-destructive hover:text-white dark:hover:bg-destructive"
              onClick={onCancel}
            />
          }
        >
          Huỷ
        </Dialog.Close>

        <Button
          type="submit"
          disabled={loading || !usernameValue?.trim()}
          className="h-10 flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {loading ? (
            <span>Đang tìm ...</span>
          ) : (
            <>
              <Search className="size-4 mr-2" /> Tìm
            </>
          )}
        </Button>
      </DialogFooter>
    </form>
  );
};

export default SearchForm;
