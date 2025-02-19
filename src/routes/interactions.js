const router = require('express').Router()
const { supabase } = require('../config/supabase')
const { authenticateUser } = require('../middleware/auth')

router.post('/:id/like', authenticateUser, async (req, res) => {
    const { id } = req.params
    console.log('User ID:', req.user.id)
    console.log('Recipe ID:', id)

    try {
        // Verify recipe exists first
        const { data: recipe, error: recipeError } = await supabase
            .from('recipes')
            .select('id')
            .eq('id', id)
            .single()

        if (recipeError || !recipe) {
            throw new Error('Recipe not found')
        }

        // Check for existing like
        const { data: existingLike, error: likeError } = await supabase
            .from('recipe_likes')
            .select('*')
            .eq('recipe_id', id)
            .eq('user_id', req.user.id)
            .maybeSingle()

        if (likeError) {
            throw likeError
        }

        if (existingLike) {
            // Unlike
            const { error: deleteError } = await supabase
                .from('recipe_likes')
                .delete()
                .eq('recipe_id', id)
                .eq('user_id', req.user.id)

            if (deleteError) throw deleteError
            res.json({ liked: false })
        } else {
            // Like the recipe
            const { error: insertError } = await supabase
                .from('recipe_likes')
                .insert({
                    recipe_id: id,
                    user_id: req.user.id
                })

            if (insertError) throw insertError
            res.json({ liked: true })
        }
    } catch (error) {
        console.error('Like error:', error)
        res.status(400).json({ error: error.message })
    }
})
router.post('/:id/rate', authenticateUser, async (req, res) => {
    const { id } = req.params
    const { rating } = req.body
    console.log('Rating:', { recipeId: id, userId: req.user.id, rating })

    try {
        const { data: recipe, error: recipeError } = await supabase
            .from('recipes')
            .select('id')
            .eq('id', id)
            .single()

        if (recipeError || !recipe) {
            throw new Error('Recipe not found')
        }

        const { data, error } = await supabase
            .from('recipe_ratings')
            .upsert({
                recipe_id: id,
                user_id: req.user.id,
                rating: parseInt(rating)
            }, {
                onConflict: 'recipe_id,user_id'
            })
            .select()

        if (error) throw error
        res.json({ success: true, data })
    } catch (error) {
        console.error('Rating error:', error)
        res.status(400).json({ error: error.message })
    }
})

router.post('/:id/comment', authenticateUser, async (req, res) => {
    const { id } = req.params
    const { comment } = req.body

    console.log('=== Comment Debug Info ===')
    console.log('Auth User:', req.user)
    console.log('Recipe ID:', id)
    console.log('Comment:', comment)

    try {
        // Verify authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        console.log('Verified Auth User:', user)

        const { data, error } = await supabase
            .from('recipe_comments')
            .insert({
                recipe_id: id,
                user_id: user.id, 
                comment: comment
            })
            .select()

        if (error) {
            console.error('Insert Error:', {
                code: error.code,
                msg: error.message,
                details: error.details
            })
            throw error
        }

        console.log('Comment Added:', data)
        res.status(201).json({ success: true, data })

    } catch (error) {
        console.error('Error Stack:', error)
        res.status(400).json({
            error: error.message,
            code: error.code,
            details: error.details
        })
    }
})

router.get('/:id/stats', async (req, res) => {
    const { id } = req.params;
    try {
        const [likes, ratings, comments] = await Promise.all([
            supabase
                .from('recipe_likes')
                .select('*', { count: 'exact' })
                .eq('recipe_id', id),
            supabase
                .from('recipe_ratings')
                .select('rating')
                .eq('recipe_id', id),
            supabase
                .from('recipe_comments')
                .select('*', { count: 'exact' })
                .eq('recipe_id', id)
        ]);

        const avgRating = ratings.data.length > 0
            ? ratings.data.reduce((sum, r) => sum + r.rating, 0) / ratings.data.length
            : 0;

        res.json({
            likes_count: likes.count || 0,
            rating: {
                average: avgRating,
                count: ratings.data.length
            },
            comments_count: comments.count || 0
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/:recipeId/like/status', authenticateUser, async (req, res) => {
    const { recipeId } = req.params;
    const userId = req.user.id;

    try {
        const { data: like, error } = await supabase
            .from('recipe_likes')
            .select('id')
            .eq('recipe_id', recipeId)
            .eq('user_id', userId)
            .single();

        // PGRST116 is the "no rows returned" error code, which is expected if not liked
        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        const { count: likesCount, error: countError } = await supabase
            .from('recipe_likes')
            .select('*', { count: 'exact', head: true })
            .eq('recipe_id', recipeId);

        if (countError) throw countError;

        res.json({
            liked: !!like,
            likes_count: likesCount || 0
        });

    } catch (error) {
        console.error('Error checking like status:', error);
        res.status(400).json({ error: error.message });
    }
});

module.exports = router