const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Paths
const MENU_PATH = path.join(__dirname, 'data', 'menu.json');
const RESERVATIONS_PATH = path.join(__dirname, 'data', 'reservations.json');
const INQUIRIES_PATH = path.join(__dirname, 'data', 'inquiries.json');

// Helper to read JSON safely
const readJSON = (filePath, fallback = []) => {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return fallback;
  }
};

// Helper to write JSON safely
const writeJSON = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
    return false;
  }
};

// --- API ROUTES ---

// GET /api/menu
app.get('/api/menu', (req, res) => {
  const menuData = readJSON(MENU_PATH, { categories: [], items: [], experiences: [] });
  res.json(menuData);
});

// GET /api/menu/:id
app.get('/api/menu/:id', (req, res) => {
  const menuData = readJSON(MENU_PATH, { items: [] });
  const item = (menuData.items || []).find((i) => i.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Menu item not found' });
  }
  res.json(item);
});

// GET /api/reservations
app.get('/api/reservations', (req, res) => {
  const reservations = readJSON(RESERVATIONS_PATH, []);
  res.json(reservations);
});

// GET /api/reservations/:id
app.get('/api/reservations/:id', (req, res) => {
  const code = req.params.id.toUpperCase().trim();
  const reservations = readJSON(RESERVATIONS_PATH, []);
  const found = reservations.find((r) => r.id.toUpperCase() === code);
  if (!found) {
    return res.status(404).json({ error: `Reservation ${code} not found.` });
  }
  res.json(found);
});

// POST /api/reservations
app.post('/api/reservations', (req, res) => {
  const { name, email, phone, experience, experienceName, date, time, guests, occasion, notes } = req.body;

  if (!name || !email || !date || !time || !guests) {
    return res.status(400).json({ error: 'Please provide name, email, date, time, and guest count.' });
  }

  const reservations = readJSON(RESERVATIONS_PATH, []);
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const newReservation = {
    id: `RES-${randomNum}`,
    name: name.trim(),
    email: email.trim(),
    phone: (phone || '').trim(),
    experience: experience || 'main-dining',
    experienceName: experienceName || 'Main Brasserie Hall',
    date,
    time,
    guests: parseInt(guests, 10) || 2,
    occasion: occasion || 'Dining Experience',
    notes: (notes || '').trim(),
    status: 'Confirmed',
    createdAt: new Date().toISOString()
  };

  reservations.unshift(newReservation);
  writeJSON(RESERVATIONS_PATH, reservations);

  res.status(201).json({
    success: true,
    message: 'Your table has been reserved at L\'AURA.',
    reservation: newReservation
  });
});

// DELETE /api/reservations/:id
app.delete('/api/reservations/:id', (req, res) => {
  const code = req.params.id.toUpperCase().trim();
  let reservations = readJSON(RESERVATIONS_PATH, []);
  const initialLength = reservations.length;
  reservations = reservations.filter((r) => r.id.toUpperCase() !== code);

  if (reservations.length === initialLength) {
    return res.status(404).json({ error: `Reservation ${code} could not be found to cancel.` });
  }

  writeJSON(RESERVATIONS_PATH, reservations);
  res.json({ success: true, message: `Reservation ${code} has been cancelled.` });
});

// POST /api/contact
app.post('/api/contact', (req, res) => {
  const { name, email, phone, subject, eventType, guestCount, targetDate, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }

  const inquiries = readJSON(INQUIRIES_PATH, []);
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const newInquiry = {
    id: `INQ-${randomNum}`,
    name: name.trim(),
    email: email.trim(),
    phone: (phone || '').trim(),
    subject: subject || 'General Dining Inquiry',
    eventType: eventType || 'General Inquiry',
    guestCount: guestCount ? parseInt(guestCount, 10) : null,
    targetDate: targetDate || null,
    message: message.trim(),
    createdAt: new Date().toISOString()
  };

  inquiries.unshift(newInquiry);
  writeJSON(INQUIRIES_PATH, inquiries);

  res.status(201).json({
    success: true,
    message: 'Thank you for reaching out to L\'AURA. Our concierge team will reply within 24 hours.',
    inquiry: newInquiry
  });
});

// POST /api/newsletter
app.post('/api/newsletter', (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  res.json({
    success: true,
    message: 'Welcome to L\'AURA Cellar Notes. You will receive private tasting invitations and seasonal menus.'
  });
});

// GET /api/status (Live restaurant status)
app.get('/api/status', (req, res) => {
  const now = new Date();
  const day = now.getDay(); // 0 is Sunday, 1 is Monday
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  let isOpen = false;
  let statusText = 'Closed';
  let nextService = '';

  if (day === 1) {
    // Monday
    isOpen = false;
    statusText = 'Closed Today (Cellar & Harvest Day)';
    nextService = 'Reopens Tuesday at 5:00 PM';
  } else if (day >= 2 && day <= 4) {
    // Tue - Thu: 5:00 PM (17:00) to 10:30 PM (22:30)
    if (timeInMinutes >= 17 * 60 && timeInMinutes <= 22 * 60 + 30) {
      isOpen = true;
      statusText = 'Open for Dinner Service';
    } else {
      isOpen = false;
      statusText = 'Closed';
      nextService = timeInMinutes < 17 * 60 ? 'Dinner starts at 5:00 PM today' : 'Reopens tomorrow at 5:00 PM';
    }
  } else if (day === 5 || day === 6) {
    // Fri - Sat: Lunch 12:00 - 14:30, Dinner 17:00 - 23:00
    if ((timeInMinutes >= 12 * 60 && timeInMinutes <= 14 * 60 + 30) || (timeInMinutes >= 17 * 60 && timeInMinutes <= 23 * 60)) {
      isOpen = true;
      statusText = timeInMinutes <= 14 * 60 + 30 ? 'Open for Lunch Service' : 'Open for Dinner Service';
    } else {
      isOpen = false;
      statusText = 'Closed';
      nextService = timeInMinutes < 12 * 60 ? 'Lunch starts at 12:00 PM today' : 'Dinner starts at 5:00 PM today';
    }
  } else if (day === 0) {
    // Sunday: Brunch 11:30 - 15:00, Dinner 17:00 - 21:30
    if ((timeInMinutes >= 11 * 60 + 30 && timeInMinutes <= 15 * 60) || (timeInMinutes >= 17 * 60 && timeInMinutes <= 21 * 60 + 30)) {
      isOpen = true;
      statusText = timeInMinutes <= 15 * 60 ? 'Open for Botanical Brunch' : 'Open for Sunday Dinner';
    } else {
      isOpen = false;
      statusText = 'Closed';
      nextService = 'Next service at 5:00 PM';
    }
  }

  res.json({
    isOpen,
    statusText,
    nextService,
    activeTables: 28,
    sommelierOnDuty: 'Marcus Thorne',
    executiveHeadChef: 'Eleanor Vance'
  });
});

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));

// HTML Page Routes with Clean URLs
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/menu', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'menu.html'));
});

app.get('/about', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'about.html'));
});

app.get('/reservations', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reservations.html'));
});

app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

// Fallback for 404
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✨ L'AURA Restaurant Server running at http://localhost:${PORT}`);
});
