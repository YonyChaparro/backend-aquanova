const rateLimitStore = new Map();

const loginLimiter = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const maxAttempts = 5;
    
    const record = rateLimitStore.get(ip);
    
    if (!record) {
        rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
        return next();
    }
    
    if (now > record.resetAt) {
        rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
        return next();
    }
    
    if (record.count >= maxAttempts) {
        const waitMs = record.resetAt - now;
        const waitMin = Math.ceil(waitMs / 60000);
        return res.status(429).json({ 
            ok: false, 
            message: `Demasiados intentos. Intenta en ${waitMin} minutos.` 
        });
    }
    
    record.count++;
    next();
};

const cleanupExpired = () => {
    const now = Date.now();
    for (const [ip, record] of rateLimitStore.entries()) {
        if (now > record.resetAt) {
            rateLimitStore.delete(ip);
        }
    }
};

setInterval(cleanupExpired, 60000);

module.exports = loginLimiter;