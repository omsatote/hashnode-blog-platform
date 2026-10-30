import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  bio: { type: String, default: "", maxlength: 200 },
  avatarUrl: { type: String, default: "" },
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }]
}, { timestamps: true });

const tagSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, lowercase: true, trim: true },
  slug: { type: String, required: true, unique: true }
}, { timestamps: true });

const postSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  slug: { type: String, required: true, unique: true },
  content: { type: String, required: true },
  excerpt: { type: String, maxlength: 250 },
  coverImage: { type: String, default: "" },
  status: { type: String, enum: ["draft", "published"], default: "draft" },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  tags: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tag" }],
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
}, { timestamps: true });

postSchema.index({ status: 1, createdAt: -1 });
postSchema.index({ title: "text" });

export const User = mongoose.model("User", userSchema);
export const Tag = mongoose.model("Tag", tagSchema);
export const Post = mongoose.model("Post", postSchema);
export const Comment = mongoose.model("Comment", new mongoose.Schema({
  body: { type: String, required: true, trim: true, maxlength: 1000 },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true }
}, { timestamps: true }));
