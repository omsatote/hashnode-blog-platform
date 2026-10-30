import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import slugify from "slugify";
import { User, Tag, Post } from "./models.js";

const authors = [
  { name: "Maya Chen", email: "maya@hashnode.local", bio: "Frontend engineer exploring accessible interfaces and design systems." },
  { name: "Arjun Rao", email: "arjun@hashnode.local", bio: "Backend developer writing about APIs, databases, and reliable systems." },
  { name: "Sofia Martin", email: "sofia@hashnode.local", bio: "Developer advocate helping teams ship better products." }
];
const articles = [
  { title: "Building a calmer developer workflow", author: "maya@hashnode.local", tags: ["productivity", "career"], content: "# Building a calmer developer workflow\n\nSmall systems beat heroic bursts of energy. In this guide we create a weekly workflow that protects focus and leaves room for learning.\n\n```js\nconst focusBlock = { duration: 50, break: 10 };\nconsole.log(`Starting ${focusBlock.duration} minute block`);\n```\n\nStart with one repeatable habit, then improve it after you have evidence." },
  { title: "A practical guide to resilient API design", author: "arjun@hashnode.local", tags: ["javascript", "backend"], content: "# A practical guide to resilient API design\n\nReliable APIs make failure visible and recovery predictable. We will cover validation, ownership checks, and useful error responses.\n\n## Set clear boundaries\n\nValidate input at the edge and keep database access behind focused service functions." },
  { title: "Designing accessible interfaces that feel fast", author: "sofia@hashnode.local", tags: ["design", "frontend"], content: "# Designing accessible interfaces that feel fast\n\nPerceived performance is part of accessibility. Clear hierarchy, visible focus states, and meaningful loading feedback help every reader.\n\nUse motion to explain change, never to hide it." },
  { title: "What I learned from shipping my first open source feature", author: "maya@hashnode.local", tags: ["opensource", "career"], content: "# What I learned from shipping my first open source feature\n\nThe best pull requests are easy to review. Here are the habits that helped me communicate intent, test edge cases, and respond to feedback." }
];

await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/hashnode");
const password = await bcrypt.hash("hashnode123", 12);
const users = {};
for (const author of authors) users[author.email] = await User.findOneAndUpdate({ email: author.email }, { ...author, password }, { upsert: true, new: true, setDefaultsOnInsert: true });
for (const article of articles) {
  const tagIds = [];
  for (const name of article.tags) {
    const tag = await Tag.findOneAndUpdate({ name }, { name, slug: slugify(name, { lower: true, strict: true }) }, { upsert: true, new: true });
    tagIds.push(tag._id);
  }
  await Post.findOneAndUpdate(
    { title: article.title },
    { title: article.title, slug: slugify(article.title, { lower: true, strict: true }), content: article.content, excerpt: article.content.replace(/[#*_`[\]]/g, "").slice(0, 220), status: "published", author: users[article.author]._id, tags: tagIds },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}
console.log(`Seeded ${articles.length} published articles and ${authors.length} community authors.`);
await mongoose.disconnect();
