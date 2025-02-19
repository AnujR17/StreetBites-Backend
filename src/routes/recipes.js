const router = require('express').Router()
const { supabase } = require('../config/supabase')
const { authenticateUser } = require('../middleware/auth')
const multer = require('multer')
const upload = multer()

router.post('/', authenticateUser, upload.single('image'), async (req, res) => {
    try {
        const { 
            title, 
            description, 
            prep_time, 
            cook_time, 
            servings, 
            difficulty,
            ingredients, 
            instructions,
            image_url 
        } = req.body

        console.log('Received data:', { 
            ...req.body, 
            file: req.file ? 'present' : 'not present' 
        })

        // Handling images
        let image_path = null
        if (req.file) {
            // Direct file upload
            const fileName = `${Date.now()}-${req.file.originalname.replace(/\s+/g, '-')}`
            const { data, error } = await supabase.storage
                .from('recipe-images')
                .upload(`recipes/${fileName}`, req.file.buffer, {
                    contentType: req.file.mimetype
                })
            
            if (error) throw new Error(`Image upload failed: ${error.message}`)
            image_path = data.path
        } else if (image_url) {
            // Handling image URL
            try {
                const response = await fetch(image_url)
                if (!response.ok) throw new Error('Failed to fetch image')
                
                const buffer = await response.arrayBuffer()
                const fileName = `${Date.now()}-url-image.jpg`
                
                const { data, error } = await supabase.storage
                    .from('recipe-images')
                    .upload(`recipes/${fileName}`, buffer, {
                        contentType: 'image/jpeg'
                    })
                
                if (error) throw new Error(`Image URL upload failed: ${error.message}`)
                image_path = data.path
            } catch (error) {
                throw new Error(`Invalid image URL: ${error.message}`)
            }
        }

        // Processing ingredients (comma separated)
        const ingredientsList = ingredients
            .split(',')
            .map(i => i.trim())
            .filter(i => i.length > 0)

        // Processing instructions (array of steps)
        const instructionsList = JSON.parse(instructions || '[]')

        // Creating recipe
        const { data: recipe, error: recipeError } = await supabase
            .from('recipes')
            .insert([{
                user_id: req.user.id,
                title,
                description,
                prep_time: parseInt(prep_time),
                cook_time: parseInt(cook_time),
                servings: parseInt(servings),
                difficulty,
                image_path
            }])
            .select()
            .single()

        if (recipeError) throw recipeError

        // Storing ingredients
        if (ingredientsList.length > 0) {
            const { error: ingredientsError } = await supabase
                .from('recipe_ingredients')
                .insert(ingredientsList.map(ingredient => ({
                    recipe_id: recipe.id,
                    ingredient,
                    quantity: '1',  
                    unit: 'unit'    
                })))
            if (ingredientsError) throw ingredientsError
        }

        // Storing instructions
        if (instructionsList.length > 0) {
            const { error: instructionsError } = await supabase
                .from('recipe_instructions')
                .insert(instructionsList.map((instruction, index) => ({
                    recipe_id: recipe.id,
                    step_number: index + 1,
                    instruction
                })))
            if (instructionsError) throw instructionsError
        }

        res.status(201).json({
            ...recipe,
            ingredients: ingredientsList,
            instructions: instructionsList
        })

    } catch (error) {
        console.error('Recipe creation error:', error)
        res.status(400).json({ error: error.message })
    }
})

// Fetching recipe cards
router.get('/cards', async (req, res) => {
    try {
        const { data: recipes, error } = await supabase
            .from('recipes')
            .select(`
                id,
                title,
                description,
                image_path,
                prep_time,
                cook_time,
                servings,
                difficulty,
                user_id,
                created_at
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

       const recipesWithDetails = await Promise.all(
            recipes.map(async (recipe) => {
                const [userProfile, likesCount] = await Promise.all([
                    supabase
                        .from('user_profiles')
                        .select('username')
                        .eq('id', recipe.user_id)
                        .single(),
                    supabase
                        .from('recipe_likes')
                        .select('*', { count: 'exact' })
                        .eq('recipe_id', recipe.id)
                ]);

                return {
                    ...recipe,
                    user: userProfile.data,
                    likes_count: likesCount.count || 0
                };
            })
        );

        res.json(recipesWithDetails);
    } catch (error) {
        console.error('Error fetching cards:', error);
        res.status(400).json({ error: error.message });
    }
});

// Fetching recipe details
router.get('/:id/details', async (req, res) => {
    const { id } = req.params;
    try {
        // Getting basic recipe info
        const { data: recipe, error: recipeError } = await supabase
            .from('recipes')
            .select('*')
            .eq('id', id)
            .single();

        if (recipeError) throw recipeError;

        const [userProfile, ingredients, instructions, likes, ratings] = await Promise.all([
            supabase
                .from('user_profiles')
                .select('username')
                .eq('id', recipe.user_id)
                .single(),
            supabase
                .from('recipe_ingredients')
                .select('*')
                .eq('recipe_id', id),
            supabase
                .from('recipe_instructions')
                .select('*')
                .eq('recipe_id', id)
                .order('step_number'),
            supabase
                .from('recipe_likes')
                .select('*', { count: 'exact' })
                .eq('recipe_id', id),
            supabase
                .from('recipe_ratings')
                .select('rating')
                .eq('recipe_id', id)
        ]);

        res.json({
            ...recipe,
            user: userProfile.data,
            ingredients: ingredients.data,
            instructions: instructions.data,
            interactions: {
                likes_count: likes.count || 0,
                rating: {
                    average: ratings.data.length > 0
                        ? ratings.data.reduce((sum, r) => sum + r.rating, 0) / ratings.data.length
                        : 0,
                    count: ratings.data.length
                },
            }
        });
    } catch (error) {
        console.error('Error fetching recipe details:', error);
        res.status(400).json({ error: error.message });
    }
});

// Fetching comments for a recipe
router.get('/:id/comments', async (req, res) => {
    const { id } = req.params;
    console.log('Fetching comments for recipe:', id);

    try {
        const { data: comments, error: commentsError } = await supabase
            .from('recipe_comments')
            .select('*')
            .eq('recipe_id', id);

        if (commentsError) {
            console.error('Comments fetch error:', commentsError);
            throw commentsError;
        }

        console.log('Found comments:', comments);

        const commentsWithUsers = await Promise.all(
            comments.map(async (comment) => {
                const { data: userData, error: userError } = await supabase
                    .from('user_profiles')
                    .select('username')
                    .eq('id', comment.user_id)
                    .single();

                if (userError) {
                    console.error('User fetch error:', userError);
                }

                return {
                    id: comment.id,
                    comment: comment.comment,
                    created_at: comment.created_at,
                    username: userData?.username || 'Unknown User',
                    user_id: comment.user_id
                };
            })
        );

        console.log('Comments with users:', commentsWithUsers);
        res.json(commentsWithUsers);

    } catch (error) {
        console.error('Final error:', error);
        res.status(400).json({ error: error.message });
    }
});

// Deleting a recipe
router.delete('/:id', authenticateUser, async (req, res) => {
    const { id } = req.params;
    console.log('Attempting to delete recipe:', id);

    try {
        const { data: recipe, error: recipeError } = await supabase
            .from('recipes')
            .select('user_id')
            .eq('id', id)
            .single();

        if (recipeError) throw recipeError;

        if (recipe.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized to delete this recipe' });
        }

        const { error: deleteError } = await supabase
            .from('recipes')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        res.json({ message: 'Recipe deleted successfully' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(400).json({ error: error.message });
    }
});

// Searching recipes
router.get('/search', async (req, res) => {
    const { query } = req.query;
    console.log('Search query:', query);

    try {
        const { data, error } = await supabase
            .from('recipes')
            .select(`
                id,
                title,
                description,
                image_path,
                prep_time,
                cook_time,
                servings,
                difficulty,
                user_id,
                created_at
            `)
            .or(`title.ilike.%${query}%, description.ilike.%${query}%`)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const recipesWithDetails = await Promise.all(
            data.map(async (recipe) => {
                const [userProfile, likesCount] = await Promise.all([
                    supabase
                        .from('user_profiles')
                        .select('username')
                        .eq('id', recipe.user_id)
                        .single(),
                    supabase
                        .from('recipe_likes')
                        .select('*', { count: 'exact' })
                        .eq('recipe_id', recipe.id)
                ]);

                return {
                    ...recipe,
                    user: userProfile.data,
                    likes_count: likesCount.count || 0
                };
            })
        );

        res.json(recipesWithDetails);
    } catch (error) {
        console.error('Search error:', error);
        res.status(400).json({ error: error.message });
    }
});

// Fetching user's recipes
router.get('/me', authenticateUser, async (req, res) => {
    try {
        // Getting user's recipes
        const { data: recipes, error: recipesError } = await supabase
            .from('recipes')
            .select(`
                *,
                recipe_likes(count)
            `)
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (recipesError) throw recipesError;

        const { data: userProfile, error: profileError } = await supabase
            .from('user_profiles')
            .select('username')
            .eq('id', req.user.id)
            .single();

        if (profileError) throw profileError;

        const recipesWithUser = recipes.map(recipe => ({
            ...recipe,
            user: {
                username: userProfile.username
            },
            likes_count: recipe.recipe_likes?.[0]?.count || 0
        }));

        res.json(recipesWithUser);
    } catch (error) {
        console.error('Error fetching user recipes:', error);
        res.status(400).json({ error: error.message });
    }
});

// Checking like status for a recipe
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

