import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";
import { createUserAgent } from "./agent.js";
import { initDB } from "./db.js";
import { authMiddleware } from "./middleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const db = initDB("expense_tracker.db");
app.use(express.json());
app.use(cors());

// Serve static files from dist folder
app.use(express.static(path.join(__dirname, "../dist")));
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
app.get("/health", (_req, res) => {
    return res.json({ status: "Healthy", timeStamp: new Date().toISOString() });
});
app.post("/auth/register", async (req, res) => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password || !name) {
            return res.status(400).json({ message: "Missing required fields" });
        }
        const existingUser = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
        if (existingUser) {
            return res.status(409).json({ message: "User already exists" });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const result = db.prepare("INSERT INTO users (email, password, name) VALUES (?, ?, ?)").run(email, hashedPassword, name);
        return res.status(201).json({
            message: "User registered successfully",
            userId: result.lastInsertRowid,
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
});
app.post("/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "Missing email or password" });
        }
        const user = db.prepare("SELECT id, email, password, name FROM users WHERE email = ?").get(email);
        if (!user) {
            return res.status(401).json({ message: "Invalid email or password" });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid email or password" });
        }
        const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
        return res.json({
            token,
            user: { id: user.id, email: user.email, name: user.name },
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
});
app.post("/chat", authMiddleware, async (req, res) => {
    const body = req.body;
    const userId = req.user?.id;
    if (!userId) {
        res.status(401).json({ message: "User not authenticated" });
        return;
    }
    res.writeHead(200, {
        "Content-Type": "text/event-stream"
    });
    const agent = createUserAgent(userId);
    const response = await agent.stream({
        messages: [
            {
                role: "user",
                content: body?.query
            }
        ]
    }, {
        streamMode: ["messages", "custom"],
        configurable: { thread_id: `user_${userId}` }
    });
    for await (const [eventType, chunk] of response) {
        let message = {};
        if (eventType === "custom") {
            message = chunk;
        }
        else if (eventType === "messages") {
            if (chunk[0].content === "")
                continue;
            const messageType = chunk[0].type;
            if (messageType === "ai") {
                message = { type: "ai", payload: { text: chunk[0].content } };
            }
            else if (messageType === "tool") {
                message = { type: "tool", payload: { name: chunk[0].name, result: JSON.parse(chunk[0].content) } };
            }
        }
        res.write(`event: ${eventType}\n`);
        res.write(`data: ${JSON.stringify(message)}\n\n`);
    }
    res.end();
});

// Fallback to index.html for SPA routing (must be after all API routes)
app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(__dirname, "../dist", "index.html"));
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
