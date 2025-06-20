// server.js
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const session = require('express-session');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const port = process.env.PORT || 3000;
const app = express();

// Middleware to parse URL-encoded data and JSON payloads
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// MongoDB Connection
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/fitness-application", {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log("Database connected 🖇️ ✅");
    } catch (error) {
        console.error("Database connection failed ⚠️😖", error);
        process.exit(1);
    }
};
connectDB();

// User Schema
const userSchema = new mongoose.Schema({
    email: { type: String, unique: true, required: true },
    username: { type: String, unique: true, required: true },
    name: String,
    password: String,
    role: { type: String, enum: ['user', 'trainer', 'admin'], required: true }
});
const User = mongoose.model('User', userSchema);

// Appointment Schema
const appointmentSchema = new mongoose.Schema({
    name: String,
    email: String,
    trainerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    gender: String,
    age: Number,
    date: Date,
    time: String,
    appointmentType: String,
    appointmentPhone: Number
});
const Appointments = mongoose.model('Appointments', appointmentSchema);

// Payment Schema
const paymentSchema = new mongoose.Schema({
    name: { type: String, index: true },
    phone: { type: String, index: true },
    amount: Number,
    paymentMethod: String,
    upiId: String,
    cardNumber: String,
    expiry: String,
    cvv: String,
    status: { type: String, default: 'Completed' },
    date: { type: Date, default: Date.now } // Ensure date is stored as a Date object
});
const Payment = mongoose.model('Payment', paymentSchema);

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login.html');
    }
};

// Serve login page by default
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Signup Route
app.post('/signup', async (req, res) => {
    try {
        const { name, username, password, email, role } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered! Try another.' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ email, username, name, password: hashedPassword, role });
        await newUser.save();
        res.redirect('/');
    } catch (err) {
        res.status(500).json({ error: `Error occurred: ${err.message}` });
    }
});

// Login Route
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        req.session.user = user; // Store user in session
        res.json({
            role: user.role,
            redirect: user.role === 'user' ? '/user_dashboard.html' : user.role === 'trainer' ? '/trainer_dashboard.html' : '/admin_dashboard.html',
            trainerId: user.role === 'trainer' ? user._id : null
        });
    } catch (err) {
        console.error("Error in login:", err);
        res.status(500).json({ error: `Error occurred: ${err.message}` });
    }
});

// Logout Route
app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: 'Could not log out, please try again' });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

// User Appointment Route
app.post('/userappointment', async (req, res) => {
    try {
        const { name, email, trainerId, gender, age, date, time, appointmentType, appointmentPhone } = req.body;

        // Validate the trainer ID format
        if (!mongoose.Types.ObjectId.isValid(trainerId)) {
            return res.status(400).json({ error: 'Invalid trainer ID. Please select a valid trainer.' });
        }

        // Check if the trainer exists and if they are a trainer
        const trainer = await User.findById(trainerId);
        if (!trainer || trainer.role !== 'trainer') {
            return res.status(400).json({ error: 'Trainer not found. Please select a valid trainer.' });
        }

        // Create the appointment
        const newAppointment = new Appointments({
            name, email, trainerId, gender, age, date, time, appointmentType, appointmentPhone
        });
        await newAppointment.save();
        res.redirect('/asucces.html');
    } catch (err) {
        console.error("Error in /userappointment:", err);
        res.status(500).json({ error: `Error occurred: ${err.message}` });
    }
});

// Payment Route
app.post("/payment", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ message: "Unauthorized. Please log in." });
        }

        const { phone, cardNumber, expiry, cvv, upiId, amount, paymentMethod } = req.body;
        const { name, email } = req.session.user; // Extract user details from session

        if (!["UPI", "Credit", "Debit"].includes(paymentMethod)) {
            return res.status(400).json({ message: "Invalid payment method" });
        }

        const paymentData = { 
            name, 
            email, 
            phone, 
            amount, 
            paymentMethod, 
            date: new Date() // Ensure date is a valid Date object
        };

        if (paymentMethod === "UPI") {
            paymentData.upiId = upiId;
        } else {
            paymentData.cardNumber = cardNumber;
            paymentData.expiry = expiry;
            paymentData.cvv = cvv;
        }

        const payment = new Payment(paymentData);
        await payment.save();
        
        res.status(201).json({ message: "Payment saved successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
});

// Check Membership Route
app.post("/checkMembership", async (req, res) => {
    try {
        const { name, phone } = req.body;

        // Basic validation
        if (!name || !phone) {
            return res.status(400).json({ error: "Name and phone are required." });
        }

        // Check if user exists in Payment collection
        const paymentRecord = await Payment.findOne({ name, phone });

        if (paymentRecord) {
            res.json({ premium: true }); // Redirect to premium user page
        } else {
            res.json({ premium: false }); // Redirect to normal premium page
        }
    } catch (error) {
        console.error("Error checking membership:", error);
        res.status(500).json({ error: "Server error. Please try again later." });
    }
});


// Fetch All Payments Route
app.get('/api/payments', async (req, res) => {
    try {
        const payments = await Payment.find();
        res.json(payments);
    } catch (err) {
        res.status(500).json({ error: `Error fetching payments: ${err.message}` });
    }
});

// Fetch All Appointments Route
app.get('/api/appointments', async (req, res) => {
    try {
        const appointments = await Appointments.find();
        res.json(appointments);
    } catch (err) {
        res.status(500).json({ error: `Error fetching appointments: ${err.message}` });
    }
});
// Fetch appointments for a specific trainer
app.get('/trainer/appointments/:trainerId', async (req, res) => {
    try {
        const { trainerId } = req.params;

        // Validate trainerId format
        if (!mongoose.Types.ObjectId.isValid(trainerId)) {
            return res.status(400).json({ error: 'Invalid Trainer ID format' });
        }

        // Check if trainer exists and is actually a trainer
        const trainer = await User.findOne({ _id: trainerId, role: 'trainer' });
        if (!trainer) {
            return res.status(404).json({ error: 'Trainer not found' });
        }

        // Fetch appointments for this trainer
        const appointments = await Appointments.find({ trainerId }).populate('trainerId', 'name');

        res.json(appointments);
    } catch (err) {
        console.error("Error fetching trainer's appointments:", err);
        res.status(500).json({ error: `Error fetching appointments: ${err.message}` });
    }
});

// Fetch All Users Route
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: `Error fetching users: ${err.message}` });
    }
});

// Fetch All Trainers Route
app.get('/api/trainers', async (req, res) => {
    try {
        const trainers = await User.find({ role: 'trainer' }).select('_id name');
        res.json(trainers);
    } catch (err) {
        res.status(500).json({ error: `Error fetching trainers: ${err.message}` });
    }
});

// Route to serve Admin Dashboard
app.get("/admin_dashboard", isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin_dashboard.html"));
});

// Start Server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});