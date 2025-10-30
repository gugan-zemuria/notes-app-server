require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { createClient } = require('@supabase/supabase-js');

// Import auth routes and middleware
const authRoutes = require('./routes/auth');
const { authenticateUser, optionalAuth } = require('./middleware/auth');

const app = express();
const port = process.env.PORT || 5000;

// Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// Middleware
const allowedOrigins = [
    process.env.CLIENT_URL,
    'https://notes-app-xl-eight-17.vercel.app', // Production Vercel URL
    'https://notes-5l06weonn-gugans-projects-4bb04bdf.vercel.app', // New Vercel deployment
    'http://localhost:3000', // Local development
    'http://localhost:3001',
    'http://localhost:3002'
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);
        
        // Log for debugging
        console.log('Request from origin:', origin);
        console.log('Allowed origins:', allowedOrigins);
        
        // Check if origin is in allowed list
        if (allowedOrigins.indexOf(origin) !== -1) {
            return callback(null, true);
        }
        
        // Allow all Vercel preview deployments (*.vercel.app)
        if (origin && origin.endsWith('.vercel.app')) {
            return callback(null, true);
        }
        
        console.error('CORS blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Routes
app.get('/', (req, res) => {
    res.json({ 
        message: 'Notes API Server',
        clientUrl: process.env.CLIENT_URL || 'NOT SET',
        allowedOrigins: allowedOrigins
    });
});

// Auth routes
app.use('/api/auth', authRoutes);

// Database status endpoint
app.get('/api/status', async (req, res) => {
    try {
        const status = {
            server: 'running',
            database: 'connected',
            tables: {
                users: false,
                categories: false,
                labels: false,
                posts: false,
                post_labels: false
            }
        };

        // Check each table
        const tables = ['users', 'categories', 'labels', 'posts', 'post_labels'];

        for (const table of tables) {
            try {
                const { error } = await supabase
                    .from(table)
                    .select('*')
                    .limit(1);

                status.tables[table] = !error;
            } catch (err) {
                status.tables[table] = false;
            }
        }

        const allTablesExist = Object.values(status.tables).every(exists => exists);
        status.ready = allTablesExist;
        status.message = allTablesExist
            ? 'All database tables are ready'
            : 'Some database tables are missing. Please run the SQL schema in Supabase.';

        res.json(status);
    } catch (error) {
        res.status(500).json({
            server: 'running',
            database: 'error',
            ready: false,
            message: 'Database connection failed',
            error: error.message
        });
    }
});


// Initialize default categories and labels (for development only)
app.post('/api/init-defaults', async (req, res) => {
    try {
        const defaultUserId = '93ab2a88-6e1a-428b-86c4-91db17320cb9';

        // First, create the required users
        const users = [
            {
                id: '00000000-0000-0000-0000-000000000000',
                email: 'test@example.com',
                name: 'Test User',
                email_verified: true
            },
            {
                id: defaultUserId,
                email: 'user@example.com',
                name: 'Main User',
                email_verified: true
            }
        ];

        const createdUsers = [];
        for (const user of users) {
            try {
                const { data, error } = await supabase
                    .from('users')
                    .upsert([user])
                    .select();

                if (!error && data) {
                    createdUsers.push(data[0]);
                }
            } catch (err) {
                console.log(`User ${user.email} might already exist:`, err.message);
            }
        }

        // Create default categories
        const defaultCategories = [
            { name: 'Personal', color: '#3B82F6', icon: '👤' },
            { name: 'Work', color: '#EF4444', icon: '💼' },
            { name: 'Ideas', color: '#8B5CF6', icon: '💡' },
            { name: 'Tasks', color: '#F59E0B', icon: '✅' },
            { name: 'Projects', color: '#10B981', icon: '🚀' },
            { name: 'Learning', color: '#F97316', icon: '📚' },
            { name: 'Health', color: '#EC4899', icon: '🏥' },
            { name: 'Finance', color: '#06B6D4', icon: '💰' }
        ];

        const createdCategories = [];
        for (const category of defaultCategories) {
            try {
                const { data, error } = await supabase
                    .from('categories')
                    .upsert([{
                        ...category,
                        user_id: defaultUserId
                    }], {
                        onConflict: 'user_id,name',
                        ignoreDuplicates: true
                    })
                    .select();

                if (!error && data) {
                    createdCategories.push(data[0]);
                }
            } catch (err) {
                console.log(`Category ${category.name} might already exist:`, err.message);
            }
        }

        // Create default labels
        const defaultLabels = [
            { name: 'Important', color: '#EF4444' },
            { name: 'Urgent', color: '#F59E0B' },
            { name: 'Review', color: '#8B5CF6' },
            { name: 'Archive', color: '#6B7280' },
            { name: 'Draft', color: '#10B981' },
            { name: 'In Progress', color: '#3B82F6' },
            { name: 'Completed', color: '#059669' },
            { name: 'On Hold', color: '#DC2626' }
        ];

        const createdLabels = [];
        for (const label of defaultLabels) {
            try {
                const { data, error } = await supabase
                    .from('labels')
                    .upsert([{
                        ...label,
                        user_id: defaultUserId
                    }], {
                        onConflict: 'user_id,name',
                        ignoreDuplicates: true
                    })
                    .select();

                if (!error && data) {
                    createdLabels.push(data[0]);
                }
            } catch (err) {
                console.log(`Label ${label.name} might already exist:`, err.message);
            }
        }

        res.json({
            message: 'Users, categories and labels initialized',
            users: createdUsers,
            categories: createdCategories,
            labels: createdLabels
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create test users (for development only)
app.post('/api/create-test-user', async (req, res) => {
    try {
        const users = [
            {
                id: '00000000-0000-0000-0000-000000000000',
                email: 'test@example.com',
                name: 'Test User',
                email_verified: true
            },
            {
                id: '93ab2a88-6e1a-428b-86c4-91db17320cb9',
                email: 'user@example.com',
                name: 'Main User',
                email_verified: true
            }
        ];

        const createdUsers = [];
        for (const user of users) {
            const { data, error } = await supabase
                .from('users')
                .upsert([user])
                .select();

            if (error) {
                console.log(`User ${user.email} might already exist:`, error.message);
            } else if (data) {
                createdUsers.push(data[0]);
            }
        }

        res.json({ message: 'Test users created', users: createdUsers });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all posts (notes) with categories and labels
app.get('/api/notes', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        const { category, labels, search, drafts, visibility, page = 1, limit = 12 } = req.query;

        // Parse pagination parameters
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        // Check if posts table exists first
        const { error: checkError } = await supabase
            .from('posts')
            .select('id')
            .limit(1);

        if (checkError) {
            if (checkError.message.includes('Could not find the table')) {
                console.log('Posts table not found, returning empty notes array');
                return res.json({
                    data: [],
                    pagination: {
                        currentPage: 1,
                        totalPages: 0,
                        totalCount: 0,
                        limit: limitNum,
                        hasNextPage: false,
                        hasPrevPage: false
                    }
                });
            }
            throw checkError;
        }

        let query = supabase
            .from('posts')
            .select(`
                *,
                category:categories(id, name, color, icon),
                post_labels(
                    label:labels(id, name, color)
                )
            `)
            .eq('user_id', userId);

        // Filter by draft status
        if (drafts === 'true') {
            query = query.eq('is_draft', true);
        } else if (drafts === 'false') {
            query = query.eq('is_draft', false);
        }

        // Filter by visibility
        if (visibility === 'public') {
            query = query.eq('is_public', true);
        } else if (visibility === 'private') {
            query = query.eq('is_public', false);
        }

        // Filter by category if provided
        if (category) {
            query = query.eq('category_id', category);
        }

        // Search in title and content if provided
        if (search) {
            query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
        }

        query = query.order('created_at', { ascending: false });

        // Get total count for pagination
        const { count, error: countError } = await supabase
            .from('posts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (countError) {
            console.log('Count error:', countError.message);
        }

        // Apply pagination
        query = query.range(offset, offset + limitNum - 1);

        const { data, error } = await query;

        if (error) {
            // If relationship error (tables exist but no relationships), return simple data
            if (error.message.includes('Could not find a relationship')) {
                console.log('Relationship error, trying simple query');
                const { data: simpleData, error: simpleError } = await supabase
                    .from('posts')
                    .select('*')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false });

                if (simpleError) throw simpleError;

                const simpleTransformed = simpleData?.map(post => ({
                    ...post,
                    labels: [],
                    category: null,
                    // Show updated_at if note has been updated, otherwise show created_at
                    display_date: post.is_updated ? post.updated_at : post.created_at,
                    date_type: post.is_updated ? 'updated' : 'created',
                    encrypted_content: undefined
                })) || [];

                return res.json({
                    data: simpleTransformed,
                    pagination: {
                        currentPage: pageNum,
                        totalPages: Math.ceil(simpleTransformed.length / limitNum),
                        totalCount: simpleTransformed.length,
                        limit: limitNum,
                        hasNextPage: pageNum < Math.ceil(simpleTransformed.length / limitNum),
                        hasPrevPage: pageNum > 1
                    }
                });
            }
            throw error;
        }

        // Transform the data to include labels array and handle date display
        const transformedData = data?.map(post => ({
            ...post,
            labels: post.post_labels?.map(pl => pl.label) || [],
            // Show updated_at if note has been updated, otherwise show created_at
            display_date: post.is_updated ? post.updated_at : post.created_at,
            date_type: post.is_updated ? 'updated' : 'created',
            // Don't expose encrypted content in list view
            encrypted_content: undefined
        })) || [];

        // Filter by labels if provided
        let filteredData = transformedData;
        if (labels) {
            const labelIds = labels.split(',').map(id => parseInt(id));
            filteredData = transformedData.filter(post =>
                post.labels.some(label => labelIds.includes(label.id))
            );
        }

        // Calculate pagination metadata
        const totalCount = count || filteredData.length;
        const totalPages = Math.ceil(totalCount / limitNum);
        const hasNextPage = pageNum < totalPages;
        const hasPrevPage = pageNum > 1;

        res.json({
            data: filteredData,
            pagination: {
                currentPage: pageNum,
                totalPages,
                totalCount,
                limit: limitNum,
                hasNextPage,
                hasPrevPage
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create a new post (note)
app.post('/api/notes', authenticateUser, async (req, res) => {
    try {
        const {
            title,
            content,
            category_id,
            label_ids,
            is_draft = false,
            is_public = false,
            is_encrypted = false,
            encrypted_content
        } = req.body;
        const userId = req.user.id;

        // Generate public share token if public
        const public_share_token = is_public ?
            require('crypto').randomBytes(32).toString('hex') : null;

        // Create the post
        const { data: postData, error: postError } = await supabase
            .from('posts')
            .insert([{
                title,
                content: is_encrypted ? null : content,
                encrypted_content: is_encrypted ? encrypted_content : null,
                category_id: category_id || null,
                user_id: userId,
                is_draft,
                is_public,
                is_encrypted,
                public_share_token,
                last_autosave: new Date(),
                updated_at: new Date()
            }])
            .select()
            .single();

        if (postError) throw postError;

        // Add labels if provided
        if (label_ids && label_ids.length > 0) {
            const labelInserts = label_ids.map(labelId => ({
                post_id: postData.id,
                label_id: labelId
            }));

            const { error: labelError } = await supabase
                .from('post_labels')
                .insert(labelInserts);

            if (labelError) throw labelError;
        }

        // Fetch the complete post with category and labels
        const { data: completePost, error: fetchError } = await supabase
            .from('posts')
            .select(`
                *,
                category:categories(id, name, color, icon),
                post_labels(
                    label:labels(id, name, color)
                )
            `)
            .eq('id', postData.id)
            .single();

        if (fetchError) throw fetchError;

        // Transform the data
        const transformedPost = {
            ...completePost,
            labels: completePost.post_labels?.map(pl => pl.label) || [],
            // Show updated_at if note has been updated, otherwise show created_at
            display_date: completePost.is_updated ? completePost.updated_at : completePost.created_at,
            date_type: completePost.is_updated ? 'updated' : 'created'
        };

        res.status(201).json(transformedPost);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update a post (note)
app.put('/api/notes/:id', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, category_id, label_ids } = req.body;
        const userId = req.user.id;

        // Update the post
        const { data, error } = await supabase
            .from('posts')
            .update({
                title,
                content,
                category_id: category_id || null,
                updated_at: new Date(),
                is_updated: true // Mark as updated
            })
            .eq('id', id)
            .eq('user_id', userId)
            .select();

        if (error) throw error;
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Note not found or access denied' });
        }

        // Update labels if provided
        if (label_ids !== undefined) {
            // Remove existing labels
            await supabase
                .from('post_labels')
                .delete()
                .eq('post_id', id);

            // Add new labels
            if (label_ids.length > 0) {
                const labelInserts = label_ids.map(labelId => ({
                    post_id: parseInt(id),
                    label_id: labelId
                }));

                const { error: labelError } = await supabase
                    .from('post_labels')
                    .insert(labelInserts);

                if (labelError) throw labelError;
            }
        }

        // Fetch the complete updated post
        const { data: completePost, error: fetchError } = await supabase
            .from('posts')
            .select(`
                *,
                category:categories(id, name, color, icon),
                post_labels(
                    label:labels(id, name, color)
                )
            `)
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        // Transform the data
        const transformedPost = {
            ...completePost,
            labels: completePost.post_labels?.map(pl => pl.label) || [],
            // Show updated_at if note has been updated, otherwise show created_at
            display_date: completePost.is_updated ? completePost.updated_at : completePost.created_at,
            date_type: completePost.is_updated ? 'updated' : 'created'
        };

        res.json(transformedPost);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a post (note)
app.delete('/api/notes/:id', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const { error } = await supabase
            .from('posts')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (error) throw error;
        res.json({ message: 'Note deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Categories endpoints
app.get('/api/categories', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .eq('user_id', userId)
            .order('name');

        if (error) {
            // If table doesn't exist, return default categories
            if (error.message.includes('Could not find the table')) {
                console.log('Categories table not found, returning default categories');
                return res.json([
                    { id: 1, name: 'Personal', color: '#3B82F6', icon: '👤' },
                    { id: 2, name: 'Work', color: '#EF4444', icon: '💼' },
                    { id: 3, name: 'Ideas', color: '#8B5CF6', icon: '💡' },
                    { id: 4, name: 'Tasks', color: '#F59E0B', icon: '✅' },
                    { id: 5, name: 'Projects', color: '#10B981', icon: '🚀' },
                    { id: 6, name: 'Learning', color: '#F97316', icon: '📚' },
                    { id: 7, name: 'Health', color: '#EC4899', icon: '🏥' },
                    { id: 8, name: 'Finance', color: '#06B6D4', icon: '💰' }
                ]);
            }
            throw error;
        }
        res.json(data || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/categories', authenticateUser, async (req, res) => {
    try {
        const { name, color, icon } = req.body;
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('categories')
            .insert([{
                name,
                color: color || '#3B82F6',
                icon: icon || '📁',
                user_id: userId
            }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Labels endpoints
app.get('/api/labels', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('labels')
            .select('*')
            .eq('user_id', userId)
            .order('name');

        if (error) {
            // If table doesn't exist, return default labels
            if (error.message.includes('Could not find the table')) {
                console.log('Labels table not found, returning default labels');
                return res.json([
                    { id: 1, name: 'Important', color: '#EF4444' },
                    { id: 2, name: 'Urgent', color: '#F59E0B' },
                    { id: 3, name: 'Review', color: '#8B5CF6' },
                    { id: 4, name: 'Archive', color: '#6B7280' },
                    { id: 5, name: 'Draft', color: '#10B981' },
                    { id: 6, name: 'In Progress', color: '#3B82F6' },
                    { id: 7, name: 'Completed', color: '#059669' },
                    { id: 8, name: 'On Hold', color: '#DC2626' }
                ]);
            }
            throw error;
        }
        res.json(data || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/labels', authenticateUser, async (req, res) => {
    try {
        const { name, color } = req.body;
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('labels')
            .insert([{
                name,
                color: color || '#10B981',
                user_id: userId
            }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Autosave endpoint for drafts
app.post('/api/notes/:id/autosave', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, encrypted_content, is_encrypted } = req.body;
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('posts')
            .update({
                title,
                content: is_encrypted ? null : content,
                encrypted_content: is_encrypted ? encrypted_content : null,
                is_encrypted,
                last_autosave: new Date(),
                updated_at: new Date(),
                is_updated: true // Mark as updated
            })
            .eq('id', id)
            .eq('user_id', userId)
            .select();

        if (error) throw error;
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Note not found or access denied' });
        }

        res.json({ message: 'Autosaved successfully', last_autosave: data[0].last_autosave });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get public note by share token
app.get('/api/public/:token', async (req, res) => {
    try {
        const { token } = req.params;

        const { data, error } = await supabase
            .from('posts')
            .select(`
                id,
                title,
                content,
                is_encrypted,
                created_at,
                updated_at,
                category:categories(id, name, color, icon),
                post_labels(
                    label:labels(id, name, color)
                )
            `)
            .eq('public_share_token', token)
            .eq('is_public', true)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: 'Public note not found' });
        }

        // Transform the data
        const transformedPost = {
            ...data,
            labels: data.post_labels?.map(pl => pl.label) || [],
            // Show updated_at if note has been updated, otherwise show created_at
            display_date: data.is_updated ? data.updated_at : data.created_at,
            date_type: data.is_updated ? 'updated' : 'created'
        };

        res.json(transformedPost);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Toggle note visibility
app.patch('/api/notes/:id/visibility', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const { is_public } = req.body;
        const userId = req.user.id;

        // Generate or remove share token based on visibility
        const public_share_token = is_public ?
            require('crypto').randomBytes(32).toString('hex') : null;

        const { data, error } = await supabase
            .from('posts')
            .update({
                is_public,
                public_share_token,
                updated_at: new Date()
            })
            .eq('id', id)
            .eq('user_id', userId)
            .select();

        if (error) throw error;
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Note not found or access denied' });
        }

        res.json({
            message: `Note ${is_public ? 'made public' : 'made private'}`,
            public_share_token: data[0].public_share_token,
            is_public: data[0].is_public
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single note by ID
app.get('/api/notes/:id', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('posts')
            .select(`
                *,
                category:categories(id, name, color, icon),
                post_labels(
                    label:labels(id, name, color)
                )
            `)
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: 'Note not found or access denied' });
        }

        // Transform the data
        const transformedPost = {
            ...data,
            labels: data.post_labels?.map(pl => pl.label) || [],
            // Show updated_at if note has been updated, otherwise show created_at
            display_date: data.is_updated ? data.updated_at : data.created_at,
            date_type: data.is_updated ? 'updated' : 'created'
        };

        res.json(transformedPost);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Publish draft (change from draft to published)
app.patch('/api/notes/:id/publish', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('posts')
            .update({
                is_draft: false,
                updated_at: new Date(),
                is_updated: true
            })
            .eq('id', id)
            .eq('user_id', userId)
            .eq('is_draft', true) // Only allow publishing actual drafts
            .select();

        if (error) throw error;
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Draft not found or access denied' });
        }

        res.json({
            message: 'Draft published successfully',
            note: data[0]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});