import jwt from "jsonwebtoken";
export function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ message: "Missing or invalid authorization header" });
        return;
    }
    const token = authHeader.substring(7);
    const secret = process.env.JWT_SECRET || "your-secret-key";
    try {
        const decoded = jwt.verify(token, secret);
        req.user = decoded;
        next();
    }
    catch (err) {
        res.status(401).json({ message: "Invalid or expired token" });
        return;
    }
}
