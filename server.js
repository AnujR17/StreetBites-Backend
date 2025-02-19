const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express()
const port = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

// Setting up routes for authentication, recipes, and interactions
app.use('/api/auth', require('./src/routes/auth'))
app.use('/api/recipes', require('./src/routes/recipes'))
app.use('/api/interactions', require('./src/routes/interactions'))

app.listen(port, () => {
    console.log(`Server running on port ${port}`)
})