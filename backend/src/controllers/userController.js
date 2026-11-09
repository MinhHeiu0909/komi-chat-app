import { uploadImageFromBuffer } from "../middlewares/uploadMiddleware.js";
import User from "../models/User.js";
import Session from "../models/Session.js";
import bcrypt from "bcrypt";
import { MIN_PASSWORD_LENGTH } from "./authController.js";
import { setOnlineVisibility } from "../socket/index.js";

export const authMe = async (req, res) => {
  try {
    const user = req.user; // lấy từ authMiddleware

    return res.status(200).json({
      user,
    });
  } catch (error) {
    console.error("Lỗi khi gọi authMe", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const searchUserByUsername = async (req, res) => {
  try {
    const { username } = req.query;

    if (!username || username.trim() === "") {
      return res.status(400).json({ message: "Cần cung cấp username trong query." });
    }

    // username luôn được lưu dạng chữ thường
    const user = await User.findOne({
      username: String(username).trim().toLowerCase(),
    }).select(
      "_id displayName username avatarUrl"
    );

    return res.status(200).json({ user });
  } catch (error) {
    console.error("Lỗi xảy ra khi searchUserByUsername", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const uploadAvatar = async (req, res) => {
  try {
    const file = req.file;
    const userId = req.user._id;

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const result = await uploadImageFromBuffer(file.buffer);

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        avatarUrl: result.secure_url,
        avatarId: result.public_id,
      },
      {
        returnDocument: "after",
      }
    ).select("avatarUrl");

    if (!updatedUser.avatarUrl) {
      return res.status(400).json({ message: "Avatar trả về null" });
    }

    return res.status(200).json({ avatarUrl: updatedUser.avatarUrl });
  } catch (error) {
    console.error("Lỗi xảy ra khi upload avatar", error);
    return res.status(500).json({ message: "Upload failed" });
  }
};

const MAX_DISPLAY_NAME = 50;
const MAX_BIO = 300;
// số điện thoại: có thể có + ở đầu, 7–20 ký tự gồm số, dấu cách, chấm, gạch
const PHONE_PATTERN = /^\+?[0-9][0-9 .-]{5,18}[0-9]$/;

/**
 * Sửa hồ sơ của chính mình. Chỉ nhận các trường dưới đây; username, email,
 * mật khẩu, avatar có API riêng (đổi username/email cần xác thực, chưa làm).
 * Gửi trường nào thì sửa trường đó.
 */
export const updateMe = async (req, res) => {
  try {
    const body = req.body ?? {};
    const $set = {};
    const $unset = {};

    if (body.displayName !== undefined) {
      const name = typeof body.displayName === "string" ? body.displayName.trim() : "";
      if (!name || name.length > MAX_DISPLAY_NAME) {
        return res
          .status(400)
          .json({ message: `Tên hiển thị gồm 1–${MAX_DISPLAY_NAME} ký tự` });
      }
      $set.displayName = name;
    }

    if (body.bio !== undefined) {
      if (typeof body.bio !== "string" || body.bio.trim().length > MAX_BIO) {
        return res.status(400).json({ message: `Giới thiệu tối đa ${MAX_BIO} ký tự` });
      }
      const bio = body.bio.trim();
      if (bio) $set.bio = bio;
      else $unset.bio = "";
    }

    if (body.phone !== undefined) {
      const phone = typeof body.phone === "string" ? body.phone.trim() : null;
      if (phone === null || (phone && !PHONE_PATTERN.test(phone))) {
        return res.status(400).json({ message: "Số điện thoại không hợp lệ" });
      }
      if (phone) $set.phone = phone;
      else $unset.phone = "";
    }

    if (body.showOnlineStatus !== undefined) {
      if (typeof body.showOnlineStatus !== "boolean") {
        return res.status(400).json({ message: "showOnlineStatus phải là true/false" });
      }
      $set.showOnlineStatus = body.showOnlineStatus;
    }

    const update = {};
    if (Object.keys($set).length) update.$set = $set;
    if (Object.keys($unset).length) update.$unset = $unset;
    if (!Object.keys(update).length) {
      return res.status(400).json({ message: "Không có gì để cập nhật" });
    }

    const user = await User.findByIdAndUpdate(req.user._id, update, {
      returnDocument: "after",
      runValidators: true,
    }).select("-hashedPassword");

    if ($set.showOnlineStatus !== undefined) {
      setOnlineVisibility(user._id, $set.showOnlineStatus);
    }

    return res.status(200).json({ user });
  } catch (error) {
    console.error("Lỗi khi cập nhật hồ sơ", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

/**
 * Đổi mật khẩu: phải đúng mật khẩu hiện tại. Đổi xong thì đăng xuất mọi
 * thiết bị khác (xoá các session khác), giữ lại phiên đang dùng.
 * Mật khẩu sai trả 400 chứ không phải 401/403, vì frontend coi 403 là
 * "access token hết hạn" và sẽ tự refresh.
 */
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};

    if (typeof currentPassword !== "string" || !currentPassword) {
      return res.status(400).json({ message: "Cần nhập mật khẩu hiện tại" });
    }
    if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) {
      return res
        .status(400)
        .json({ message: `Mật khẩu mới cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự` });
    }
    if (newPassword.length > 128) {
      return res.status(400).json({ message: "Mật khẩu mới tối đa 128 ký tự" });
    }

    const user = await User.findById(req.user._id).select("hashedPassword");
    const correct = user && (await bcrypt.compare(currentPassword, user.hashedPassword));
    if (!correct) {
      return res.status(400).json({ message: "Mật khẩu hiện tại không đúng" });
    }
    if (await bcrypt.compare(newPassword, user.hashedPassword)) {
      return res.status(400).json({ message: "Mật khẩu mới phải khác mật khẩu hiện tại" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.updateOne({ _id: user._id }, { $set: { hashedPassword } });

    const currentToken = req.cookies?.refreshToken;
    const { deletedCount } = await Session.deleteMany({
      userId: user._id,
      ...(currentToken ? { refreshToken: { $ne: currentToken } } : {}),
    });

    return res.status(200).json({ message: "Đã đổi mật khẩu", signedOutSessions: deletedCount });
  } catch (error) {
    console.error("Lỗi khi đổi mật khẩu", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
