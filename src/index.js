const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;


// Allow frontend origin
app.use(cors({
    origin: "http://localhost:5173",
    credentials: true,
}));

app.use(express.json());

const authRoutes = require('./routes/login_signup');
const UniRoutes = require('./routes/UniProgram');
const UserDataRoutes = require('./routes/UserData');



app.use('/api/auth', authRoutes);
app.use('/api', UniRoutes);
app.use('/api', UserDataRoutes);


app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
