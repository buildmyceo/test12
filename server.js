const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- RESILIENT DATA MANAGEMENT FOR LOCAL AND SERVERLESS (VERCEL) ---

// Pre-load default seed data for resilience in serverless environments
let defaultMenu = { categories: [], items: [], experiences: [] };
let defaultReservations = [];
let defaultInquiries = [];

try {
  defaultMenu = require('./data/menu.json');
} catch (e) {
  console.warn('Warning: Could not pre-require menu.json:', e.message);
}

try {
  defaultReservations = require('./data/reservations.json');
} catch (e) {
  console.warn('Warning: Could not pre-require reservations.json:', e.message);
}

try {
  defaultInquiries = require('./data/inquiries.json');
} catch (e) {
  console.warn('Warning: Could not pre-require inquiries.json:', e.message);
}

// On Vercel serverless, root filesystem is read-only; use /tmp for writes.
// On local dev, persist to the project data/ directory.
const MENU_PATH = path.join(__dirname, 'data', 'menu.json');
const RESERVATIONS_PATH = isVercel
  ? path.join('/tmp', 'reservations.json')
  : path.join(__dirname, 'data', 'reservations.json');
const INQUIRIES_PATH = isVercel
  ? path.join('/tmp', 'inquiries.json')
  : path.join(__dirname, 'data', 'inquiries.json');

// In-memory runtime caches
let memoryReservations = null;
let memoryInquiries = null;

// Helper to read JSON safely
const readJSON = (filePath, fallback = []) => {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.warn(`Error reading ${filePath}:`, err.message);
    return fallback;
  }
};

// Helper to write JSON safely
const writeJSON = (filePath, data) => {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.warn(`Notice: Unable to write to disk (${err.message}). State maintained in memory.`);
    return false;
  }
};

const getReservations = () => {
  if (memoryReservations) return memoryReservations;
  if (fs.existsSync(RESERVATIONS_PATH)) {
    memoryReservations = readJSON(RESERVATIONS_PATH, defaultReservations);
  } else {
    memoryReservations = JSON.parse(JSON.stringify(defaultReservations));
  }
  return memoryReservations;
};

const saveReservations = (data) => {
  memoryReservations = data;
  writeJSON(RESERVATIONS_PATH, data);
};

const getInquiries = () => {
  if (memoryInquiries) return memoryInquiries;
  if (fs.existsSync(INQUIRIES_PATH)) {
    memoryInquiries = readJSON(INQUIRIES_PATH, defaultInquiries);
  } else {
    memoryInquiries = JSON.parse(JSON.stringify(defaultInquiries));
  }
  return memoryInquiries;
};

const saveInquiries = (data) => {
  memoryInquiries = data;
  writeJSON(INQUIRIES_PATH, data);
};

// --- API ROUTER ---
const apiRouter = express.Router();

// Root API Health / Info
apiRouter.get('/', (req, res) => {
  res.json({
    status: 'online',
    restaurant: "L'AURA Artisanal Modern Brasserie",
    environment: isVercel ? 'vercel-serverless' : 'local-node',
    endpoints: [
      '/api/menu',
      '/api/menu/:id',
      '/api/reservations',
      '/api/reservations/:id',
      '/api/contact',
      '/api/newsletter',
      '/api/status'
    ]
  });
});

// GET /api/menu
apiRouter.get('/menu', (req, res) => {
  const menuData = fs.existsSync(MENU_PATH)
    ? readJSON(MENU_PATH, defaultMenu)
    : defaultMenu;
  res.json(menuData);
});

// GET /api/menu/:id
apiRouter.get('/menu/:id', (req, res) => {
  const menuData = fs.existsSync(MENU_PATH)
    ? readJSON(MENU_PATH, defaultMenu)
    : defaultMenu;
  const item = (menuData.items || []).find((i) => i.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Menu item not found' });
  }
  res.json(item);
});

// GET /api/reservations
apiRouter.get('/reservations', (req, res) => {
  res.json(getReservations());
});

// GET /api/reservations/:id
apiRouter.get('/reservations/:id', (req, res) => {
  const code = (req.params.id || '').toUpperCase().trim();
  const reservations = getReservations();
  const found = reservations.find((r) => r.id.toUpperCase() === code);
  if (!found) {
    return res.status(404).json({ error: `Reservation ${code} not found.` });
  }
  res.json(found);
});

// POST /api/reservations
apiRouter.post('/reservations', (req, res) => {
  const { name, email, phone, experience, experienceName, date, time, guests, occasion, notes } = req.body;

  if (!name || !email || !date || !time || !guests) {
    return res.status(400).json({ error: 'Please provide name, email, date, time, and guest count.' });
  }

  const reservations = getReservations();
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
  saveReservations(reservations);

  res.status(201).json({
    success: true,
    message: "Your table has been reserved at L'AURA.",
    reservation: newReservation
  });
});

// DELETE /api/reservations/:id
apiRouter.delete('/reservations/:id', (req, res) => {
  const code = (req.params.id || '').toUpperCase().trim();
  let reservations = getReservations();
  const initialLength = reservations.length;
  reservations = reservations.filter((r) => r.id.toUpperCase() !== code);

  if (reservations.length === initialLength) {
    return res.status(404).json({ error: `Reservation ${code} could not be found to cancel.` });
  }

  saveReservations(reservations);
  res.json({ success: true, message: `Reservation ${code} has been cancelled.` });
});

// POST /api/contact
apiRouter.post('/contact', (req, res) => {
  const { name, email, phone, subject, eventType, guestCount, targetDate, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }

  const inquiries = getInquiries();
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
  saveInquiries(inquiries);

  res.status(201).json({
    success: true,
    message: "Thank you for reaching out to L'AURA. Our concierge team will reply within 24 hours.",
    inquiry: newInquiry
  });
});

// POST /api/newsletter
apiRouter.post('/newsletter', (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  res.json({
    success: true,
    message: "Welcome to L'AURA Cellar Notes. You will receive private tasting invitations and seasonal menus."
  });
});

// GET /api/status (Live restaurant status)
apiRouter.get('/status', (req, res) => {
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

// Mount API router under /api
app.use('/api', apiRouter);

// When deployed on Vercel, also allow apiRouter to handle requests routed directly
if (isVercel) {
  app.use(apiRouter);
}

// --- STATIC ASSETS & HTML PAGES (LOCAL DEVELOPMENT & FALLBACK) ---
app.use(express.static(path.join(__dirname, 'public')));

// Clean URL handlers for local server
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

// 404 Fallback
app.use((req, res) => {
  const notFoundPath = path.join(__dirname, 'public', '404.html');
  if (fs.existsSync(notFoundPath)) {
    res.status(404).sendFile(notFoundPath);
  } else {
    res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Conditionally start HTTP listener only when run directly (not when required by Vercel serverless)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✨ L'AURA Restaurant Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
