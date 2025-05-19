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

const authRoutes = require('./routes/auth');
const UniRoutes = require('./routes/UniProgram');
const UserDataRoutes = require('./routes/UserData');
const ProfileRoutes = require('./routes/profile');
const InfoRoutes = require('./routes/infoedit');



app.use('/api', authRoutes);
app.use('/api', UniRoutes);
app.use('/api', UserDataRoutes);
app.use('/api', ProfileRoutes);
app.use('/api', InfoRoutes);


app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
