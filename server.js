require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// --- RESILIENT DATA MANAGEMENT FOR LOCAL AND SERVERLESS (VERCEL) ---

// Pre-load default seed data for resilience in serverless environments
let defaultMenu = { categories: [], items: [], experiences: [] };
let defaultReservations = [];
let defaultInquiries = [];
let defaultUserDetails = [];

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

try {
  defaultUserDetails = require('./data/user_details.json');
} catch (e) {
  console.warn('Warning: Could not pre-require user_details.json:', e.message);
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
const USER_DETAILS_PATH = isVercel
  ? path.join('/tmp', 'user_details.json')
  : path.join(__dirname, 'data', 'user_details.json');

// In-memory runtime caches
let memoryReservations = null;
let memoryInquiries = null;
let memoryUserDetails = null;

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

const getUserDetails = () => {
  if (memoryUserDetails) return memoryUserDetails;
  if (fs.existsSync(USER_DETAILS_PATH)) {
    memoryUserDetails = readJSON(USER_DETAILS_PATH, defaultUserDetails);
  } else {
    memoryUserDetails = JSON.parse(JSON.stringify(defaultUserDetails));
  }
  return memoryUserDetails;
};

const saveUserDetails = (data) => {
  memoryUserDetails = data;
  writeJSON(USER_DETAILS_PATH, data);
};

// Optional Supabase server-side client for real-time table synchronization
let supabaseServer = null;
try {
  const { createClient } = require('@supabase/supabase-js');
  const sbUrl = process.env.SUPABASE_URL || 'https://tzgpxjblmtyosrgjobju.supabase.co';
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (sbUrl && sbKey) {
    supabaseServer = createClient(sbUrl, sbKey);
  }
} catch (e) {
  console.warn('Notice: Supabase server client not initialized:', e.message);
}

// --- API ROUTER ---
const apiRouter = express.Router();

// Root API Health / Info (GET /api)
apiRouter.get('/', (req, res) => {
  res.json({
    status: 'online',
    restaurant: "L'AURA Artisanal Modern Brasserie",
    environment: isVercel ? 'vercel-serverless' : 'local-node',
    endpoints: [
      '/api/config',
      '/api/user-details',
      '/api/user-details/me',
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

// GET /api/config (Public client configuration supporting Vercel secret ANON_KEY)
apiRouter.get('/config', (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://tzgpxjblmtyosrgjobju.supabase.co';
  const anonKey = process.env.ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6Z3B4amJsbXR5b3NyZ2pvYmp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MDgwMTksImV4cCI6MjEwNzQ4NDAxOX0.tmLj6o_SLCLm9uLSMCI9-Gflu8kULn8VCFejPlDLUqE';

  res.json({
    supabaseUrl,
    anonKey
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
  const code = req.params.id.toUpperCase().trim();
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
  const code = req.params.id.toUpperCase().trim();
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

// --- USER DETAILS / ONBOARDING PROFILE ENDPOINTS ---

// POST /api/user-details (Record visitor/user location, name, phone, about-me)
apiRouter.post('/user-details', async (req, res) => {
  try {
    const {
      fullName,
      name,
      phone,
      location,
      latitude,
      longitude,
      locationAccuracy,
      aboutMe,
      about,
      avatarUrl,
      avatar_url,
      email,
      userId
    } = req.body;

    const resolvedName = (fullName || name || '').trim();
    const resolvedPhone = (phone || '').trim();
    const resolvedLocation = (location || '').trim();
    const resolvedAbout = (aboutMe || about || '').trim();
    const resolvedAvatarUrl = (avatarUrl || avatar_url || '').trim() || null;
    const resolvedEmail = (email || '').trim().toLowerCase();
    const resolvedUserId = (userId || '').trim() || null;

    if (!resolvedName) {
      return res.status(400).json({ error: 'Please provide your full name.' });
    }
    if (!resolvedPhone) {
      return res.status(400).json({ error: 'Please provide your phone number.' });
    }
    if (!resolvedLocation) {
      return res.status(400).json({ error: 'Please provide or detect your current location.' });
    }
    if (!resolvedAbout) {
      return res.status(400).json({ error: 'Please share a brief note about yourself or your dining preferences.' });
    }

    const records = getUserDetails();
    const nowIso = new Date().toISOString();

    // Check if a record already exists for this userId or email
    const existingIndex = records.findIndex(r => {
      if (resolvedUserId && r.user_id === resolvedUserId) return true;
      if (resolvedEmail && r.email === resolvedEmail) return true;
      return false;
    });

    const recordData = {
      id: existingIndex >= 0 ? records[existingIndex].id : `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      user_id: resolvedUserId,
      full_name: resolvedName,
      phone: resolvedPhone,
      email: resolvedEmail || null,
      avatar_url: resolvedAvatarUrl || (existingIndex >= 0 ? records[existingIndex].avatar_url : null),
      location: resolvedLocation,
      latitude: latitude !== undefined && latitude !== null && !isNaN(parseFloat(latitude)) ? parseFloat(latitude) : null,
      longitude: longitude !== undefined && longitude !== null && !isNaN(parseFloat(longitude)) ? parseFloat(longitude) : null,
      location_accuracy: locationAccuracy !== undefined && locationAccuracy !== null && !isNaN(parseFloat(locationAccuracy)) ? parseFloat(locationAccuracy) : null,
      about_me: resolvedAbout,
      created_at: existingIndex >= 0 ? records[existingIndex].created_at : nowIso,
      updated_at: nowIso
    };

    if (existingIndex >= 0) {
      records[existingIndex] = recordData;
    } else {
      records.unshift(recordData);
    }
    saveUserDetails(records);

    // Sync to Supabase user_details table if database connection is available
    if (supabaseServer) {
      try {
        const payload = {
          full_name: recordData.full_name,
          phone: recordData.phone,
          email: recordData.email,
          avatar_url: recordData.avatar_url,
          location: recordData.location,
          latitude: recordData.latitude,
          longitude: recordData.longitude,
          location_accuracy: recordData.location_accuracy,
          about_me: recordData.about_me,
          updated_at: recordData.updated_at
        };
        if (recordData.user_id) {
          payload.user_id = recordData.user_id;
        }

        const { error: sbError } = await supabaseServer
          .from('user_details')
          .upsert(payload, { onConflict: recordData.user_id ? 'user_id' : undefined });

        if (sbError) {
          console.warn('Notice: Supabase user_details upsert bypassed:', sbError.message);
        } else {
          console.log(`[SUPABASE] Synced user_details for ${recordData.full_name}`);
        }
      } catch (sbErr) {
        console.warn('Notice: Supabase sync exception:', sbErr.message);
      }
    }

    console.log(`[USER_DETAILS] Recorded guest profile for: "${recordData.full_name}" (Location: ${recordData.location}, Phone: ${recordData.phone})`);

    res.status(existingIndex >= 0 ? 200 : 201).json({
      success: true,
      message: 'Guest profile and details saved successfully.',
      data: recordData
    });
  } catch (err) {
    console.error('Error in /api/user-details:', err);
    res.status(500).json({ error: 'Server error saving guest details: ' + err.message });
  }
});

// GET /api/user-details (Fetch saved details list or query by user)
apiRouter.get('/user-details', (req, res) => {
  const { email, userId } = req.query;
  const records = getUserDetails();

  if (userId) {
    const matched = records.find(r => r.user_id === userId);
    return res.json(matched || null);
  }
  if (email) {
    const cleanEmail = email.trim().toLowerCase();
    const matched = records.find(r => r.email === cleanEmail);
    return res.json(matched || null);
  }

  res.json(records);
});

// GET /api/user-details/me (Fetch current active profile)
apiRouter.get('/user-details/me', (req, res) => {
  const { email, userId } = req.query;
  const records = getUserDetails();

  if (!email && !userId) {
    return res.status(400).json({ error: 'Provide either email or userId query parameter.' });
  }

  const found = records.find(r => {
    if (userId && r.user_id === userId) return true;
    if (email && r.email === email.trim().toLowerCase()) return true;
    return false;
  });

  if (!found) {
    return res.status(404).json({ exists: false, profile: null });
  }

  res.json({ exists: true, profile: found });
});

// POST /api/upload (Resilient image upload handler for local dev & fallback)
apiRouter.post('/upload', (req, res) => {
  try {
    const { image, filename } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image data provided.' });
    }

    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let buffer;
    let ext = 'jpg';

    if (matches && matches.length === 3) {
      const mime = matches[1];
      ext = mime.split('/')[1] || 'jpg';
      if (ext === 'jpeg') ext = 'jpg';
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(image, 'base64');
    }

    const cleanName = (filename || 'avatar').replace(/[^a-zA-Z0-9_-]/g, '');
    const finalFilename = `${cleanName}_${Date.now()}.${ext}`;

    const uploadsDir = isVercel
      ? path.join('/tmp', 'uploads')
      : path.join(__dirname, 'public', 'uploads');

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const targetFilePath = path.join(uploadsDir, finalFilename);
    fs.writeFileSync(targetFilePath, buffer);

    const publicUrl = `/uploads/${finalFilename}`;
    console.log(`[STORAGE] Uploaded photo locally: ${publicUrl}`);

    res.json({
      success: true,
      url: publicUrl,
      filename: finalFilename
    });
  } catch (err) {
    console.error('Upload processing error:', err);
    res.status(500).json({ error: 'Failed to process uploaded photo: ' + err.message });
  }
});

// Mount API router strictly under /api (NEVER at the root '/')
app.use('/api', apiRouter);

// Serve uploads folder (especially on Vercel /tmp or local public/uploads)
const uploadsStaticDir = isVercel
  ? path.join('/tmp', 'uploads')
  : path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsStaticDir)) {
  try { fs.mkdirSync(uploadsStaticDir, { recursive: true }); } catch (_e) {}
}
app.use('/uploads', express.static(uploadsStaticDir));

// --- STATIC ASSETS & HTML PAGES ---
app.use(express.static(path.join(__dirname, 'public')));

// Clean URL page handlers
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/index', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/index.html', (req, res) => {
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

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/auth', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
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
