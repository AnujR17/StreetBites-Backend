const router = require('express').Router()
const { supabase } = require('../config/supabase')
const { authenticateUser } = require('../middleware/auth')

router.post('/signup', async (req, res) => {
    const { email, password, username } = req.body
    try {
        // Create auth user with metadata
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    username: username,
                    full_name: username
                }
            }
        })
        if (authError) throw authError

        // Create profile after successful signup
        if (authData.user) {
            const { error: profileError } = await supabase
                .from('user_profiles')
                .upsert([
                    { 
                        id: authData.user.id,
                        username: username
                    }
                ], 
                { onConflict: 'id' })
                .select()
            
            if (profileError) throw profileError
        }

        res.json({ 
            message: 'Signup successful',
            user: authData.user 
        })
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        // Sign in user
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        if (authError) throw authError;

        // Get user profile with username
        const { data: profileData, error: profileError } = await supabase
            .from('user_profiles')
            .select('username')
            .eq('id', authData.user.id)
            .single();

        if (profileError) throw profileError;

        res.json({
            session: authData.session,
            user: {
                id: authData.user.id,
                email: authData.user.email,
                username: profileData?.username || email.split('@')[0]
            }
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Reset Password Request
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${process.env.FRONTEND_URL}/reset-password` // Update this
        })
        if (error) throw error
        res.json({ message: 'Password reset instructions sent to email' })
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

// Update Password (after reset)
router.post('/reset-password', async (req, res) => {
    try {
        const { password } = req.body
        const { data, error } = await supabase.auth.updateUser({
            password: password
        })
        if (error) throw error
        res.json({ message: 'Password updated successfully', user: data.user })
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

// Change Password (when logged in)
router.post('/change-password', authenticateUser, async (req, res) => {
    try {
        const { current_password, new_password } = req.body
        
        // First verify current password
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: req.user.email,
            password: current_password
        })

        if (signInError) throw new Error('Current password is incorrect')

        // Update to new password
        const { data, error } = await supabase.auth.updateUser({
            password: new_password
        })

        if (error) throw error
        res.json({ message: 'Password changed successfully' })
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

module.exports = router