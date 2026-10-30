import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import slugify from "slugify";
import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";
import { User, Tag, Post, Comment } from "./models.js";

const app = express();
const port = process.env.PORT || 4000;
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));
if (process.env.CLOUDINARY_CLOUD_NAME) cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });

const publicUser = (user) => ({ id: user._id, name: user.name, email: user.email, bio: user.bio, avatarUrl: user.avatarUrl });
const tokenFor = (user) => jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: "7d" });
const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) return res.status(401).json({ message: "Authentication required" });
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    req.user = await User.findById(payload.id);
    if (!req.user) return res.status(401).json({ message: "User no longer exists" });
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};
const makeSlug = async (title, id) => {
  const base = slugify(title, { lower: true, strict: true }) || "untitled-post";
  let slug = base;
  let suffix = 1;
  while (await Post.exists({ slug, ...(id ? { _id: { $ne: id } } : {}) })) slug = `${base}-${suffix++}`;
  return slug;
};
const resolveTags = async (names = []) => Promise.all([...new Set(names.map((name) => String(name).trim().toLowerCase()).filter(Boolean))].map(async (name) => (
  Tag.findOneAndUpdate({ name }, { $setOnInsert: { name, slug: slugify(name, { lower: true, strict: true }) } }, { upsert: true, new: true })
)));
const postView = (post) => {
  const value = post.toObject();
  return { ...value, author: publicUser(post.author), likeCount: value.likes?.length || 0, readingTime: Math.max(1, Math.ceil(value.content.split(/\s+/).length / 200)) };
};

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.post("/api/uploads", auth, async (req, res, next) => {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME) return res.status(503).json({ message: "Cloudinary is not configured; paste an image URL instead" });
    if (!String(req.body.dataUri || "").startsWith("data:image/")) return res.status(400).json({ message: "A valid image data URI is required" });
    const result = await cloudinary.uploader.upload(req.body.dataUri, { folder: "hashnode" });
    res.json({ url: result.secure_url });
  } catch (error) { next(error); }
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password || password.length < 8) return res.status(400).json({ message: "Name, email, and a password of at least 8 characters are required" });
    if (await User.exists({ email: email.toLowerCase() })) return res.status(409).json({ message: "Email is already registered" });
    const user = await User.create({ name, email, password: await bcrypt.hash(password, 12) });
    res.status(201).json({ token: tokenFor(user), user: publicUser(user) });
  } catch (error) { next(error); }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const user = await User.findOne({ email: String(req.body.email || "").toLowerCase() }).select("+password");
    if (!user || !(await bcrypt.compare(req.body.password || "", user.password))) return res.status(401).json({ message: "Invalid email or password" });
    res.json({ token: tokenFor(user), user: publicUser(user) });
  } catch (error) { next(error); }
});

app.get("/api/auth/me", auth, (req, res) => res.json({ user: publicUser(req.user) }));

app.get("/api/posts", async (req, res, next) => {
  try {
    const filter = { status: "published" };
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(24, Math.max(1, Number(req.query.limit) || 6));
    if (req.query.search) filter.title = { $regex: String(req.query.search), $options: "i" };
    if (req.query.tag) {
      const tag = await Tag.findOne({ slug: req.query.tag });
      if (!tag) return res.json({ posts: [], page, pages: 1, total: 0 });
      filter.tags = tag._id;
    }
    const [posts, total] = await Promise.all([
      Post.find(filter).populate("author tags").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Post.countDocuments(filter)
    ]);
    res.json({ posts: posts.map(postView), page, pages: Math.ceil(total / limit), total });
  } catch (error) { next(error); }
});

app.get("/api/posts/mine", auth, async (req, res, next) => {
  try { res.json((await Post.find({ author: req.user._id }).populate("author tags").sort({ updatedAt: -1 })).map(postView)); } catch (error) { next(error); }
});

app.get("/api/posts/:slug", async (req, res, next) => {
  try {
    const post = await Post.findOne({ slug: req.params.slug, status: "published" }).populate("author tags");
    if (!post) return res.status(404).json({ message: "Post not found" });
    const comments = await Comment.find({ post: post._id }).populate("author").sort({ createdAt: -1 });
    res.json({ ...postView(post), comments: comments.map((comment) => ({ ...comment.toObject(), author: publicUser(comment.author) })) });
  } catch (error) { next(error); }
});

const savePost = async (req, res, next) => {
  try {
    const { title, content, tags, coverImage, status } = req.body;
    if (!title || !content) return res.status(400).json({ message: "Title and content are required" });
    const tagDocs = await resolveTags(Array.isArray(tags) ? tags : []);
    const data = { title, content, coverImage: coverImage || "", status: status === "published" ? "published" : "draft", tags: tagDocs.map((tag) => tag._id), excerpt: content.replace(/[#*_`[\]]/g, "").slice(0, 220) };
    if (req.params.id) {
      const post = await Post.findOne({ _id: req.params.id, author: req.user._id });
      if (!post) return res.status(404).json({ message: "Owned post not found" });
      const titleChanged = post.title !== title;
      Object.assign(post, data);
      if (titleChanged) post.slug = await makeSlug(title, post._id);
      await post.save();
      return res.json(postView(await post.populate("author tags")));
    }
    const post = await Post.create({ ...data, slug: await makeSlug(title), author: req.user._id });
    res.status(201).json(postView(await post.populate("author tags")));
  } catch (error) { next(error); }
};
app.post("/api/posts", auth, savePost);
app.put("/api/posts/:id", auth, savePost);
app.delete("/api/posts/:id", auth, async (req, res, next) => {
  try {
    const deleted = await Post.findOneAndDelete({ _id: req.params.id, author: req.user._id });
    if (!deleted) return res.status(404).json({ message: "Owned post not found" });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.post("/api/posts/:id/like", auth, async (req, res, next) => {
  try {
    const post = await Post.findOne({ _id: req.params.id, status: "published" });
    if (!post) return res.status(404).json({ message: "Post not found" });
    const index = post.likes.findIndex((id) => id.toString() === req.user._id.toString());
    if (index >= 0) post.likes.splice(index, 1); else post.likes.push(req.user._id);
    await post.save();
    res.json({ liked: index < 0, likeCount: post.likes.length });
  } catch (error) { next(error); }
});
app.post("/api/posts/:id/comments", auth, async (req, res, next) => {
  try {
    if (!String(req.body.body || "").trim()) return res.status(400).json({ message: "Comment cannot be empty" });
    const comment = await Comment.create({ body: req.body.body, author: req.user._id, post: req.params.id });
    res.status(201).json({ ...comment.toObject(), author: publicUser(req.user) });
  } catch (error) { next(error); }
});
app.post("/api/posts/:id/bookmark", auth, async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    const index = req.user.bookmarks.findIndex((id) => id.toString() === post._id.toString());
    if (index >= 0) req.user.bookmarks.splice(index, 1); else req.user.bookmarks.push(post._id);
    await req.user.save();
    res.json({ bookmarked: index < 0 });
  } catch (error) { next(error); }
});
app.get("/api/bookmarks", auth, async (req, res, next) => {
  try {
    const user = await req.user.populate({ path: "bookmarks", populate: [{ path: "author" }, { path: "tags" }] });
    res.json(user.bookmarks.map(postView));
  } catch (error) { next(error); }
});
app.post("/api/users/:id/follow", auth, async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString()) return res.status(400).json({ message: "You cannot follow yourself" });
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: "User not found" });
    const index = req.user.following.findIndex((id) => id.toString() === target._id.toString());
    if (index >= 0) req.user.following.splice(index, 1); else req.user.following.push(target._id);
    await req.user.save();
    res.json({ following: index < 0 });
  } catch (error) { next(error); }
});

app.get("/api/tags", async (_req, res, next) => {
  try {
    const tags = await Tag.aggregate([
      { $lookup: { from: "posts", localField: "_id", foreignField: "tags", as: "posts" } },
      { $project: { name: 1, slug: 1, count: { $size: { $filter: { input: "$posts", as: "post", cond: { $eq: ["$$post.status", "published"] } } } } } },
      { $sort: { name: 1 } }
    ]);
    res.json(tags);
  } catch (error) { next(error); }
});

app.get("/api/community", async (_req, res, next) => {
  try {
    const authors = await User.aggregate([
      { $lookup: { from: "posts", localField: "_id", foreignField: "author", as: "posts" } },
      { $project: { name: 1, bio: 1, avatarUrl: 1, postCount: { $size: { $filter: { input: "$posts", as: "post", cond: { $eq: ["$$post.status", "published"] } } } } } },
      { $match: { postCount: { $gt: 0 } } },
      { $sort: { postCount: -1, name: 1 } },
      { $limit: 24 }
    ]);
    res.json(authors.map((author) => ({ ...author, id: author._id })));
  } catch (error) { next(error); }
});

app.get("/api/users/:id", async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    const posts = await Post.find({ author: user._id, status: "published" }).populate("author tags").sort({ createdAt: -1 });
    res.json({ user: publicUser(user), posts: posts.map(postView) });
  } catch (error) { next(error); }
});
app.put("/api/users/me", auth, async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.user._id, { name: req.body.name, bio: req.body.bio || "", avatarUrl: req.body.avatarUrl || "" }, { new: true, runValidators: true });
    res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.name === "ValidationError" ? 400 : 500).json({ message: error.name === "ValidationError" ? error.message : "Something went wrong" });
});

mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/hashnode")
  .then(() => app.listen(port, () => console.log(`Hashnode API listening on http://localhost:${port}`)))
  .catch((error) => { console.error("MongoDB connection failed:", error.message); process.exit(1); });
