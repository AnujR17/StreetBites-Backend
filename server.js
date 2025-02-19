const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express()

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
    res.send('StreetBites API is running');
});

// Setting up routes for authentication, recipes, and interactions
app.use('/api/auth', require('./src/routes/auth'))
app.use('/api/recipes', require('./src/routes/recipes'))
app.use('/api/interactions', require('./src/routes/interactions'))

module.exports = app;