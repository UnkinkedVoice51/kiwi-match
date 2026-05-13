require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors()); // Allows frontend to talk to the backend
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/kiwimatch')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define the Score Schema
const scoreSchema = new mongoose.Schema({
  name: { type: String, default: 'Anonymous', maxLength: 15 },
  score: { type: Number, required: true },
  mode: { type: String, required: true, enum: ['infinite', 'moves', 'time'] },
  date: { type: Date, default: Date.now }
});

const Score = mongoose.model('Score', scoreSchema);

// GET: Fetch the top 5 scores for a specific mode
app.get('/api/scores/:mode', async (req, res) => {
  try {
    const scores = await Score.find({ mode: req.params.mode })
      .sort({ score: -1 })
      .limit(5);
    res.json(scores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Submit a new score
app.post('/api/scores', async (req, res) => {
  try {
    const { name, score, mode } = req.body;
    
    const newScore = new Score({ 
      name: name ? name.substring(0, 15) : 'Anonymous', 
      score: Number(score), 
      mode 
    });
    
    await newScore.save();
    res.status(201).json(newScore);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve static files from the current directory (HTML, CSS, JS)
app.use(express.static(__dirname));

// Explicitly send the index.html file for the homepage (and any other unhandled routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
