const { supabase } = require('../config/supabase')

const authenticateUser = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1]
    
    if (!token) {
        return res.status(401).json({ error: 'No token provided' })
    }

    try {
        const { data, error } = await supabase.auth.getUser(token)
        if (error) throw error
            req.user = data.user
        next()
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' })
    }
}

module.exports = { authenticateUser }