require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const booking = bookings.find(b =>
  b.checkoutRequestId === result.CheckoutRequestID ||
  b.checkoutRequestId === result.CheckoutRequestId
);
// ─── ENV CHECK ────────────────────────────────────────────────
console.log("🔑 CONSUMER KEY:   ", process.env.CONSUMER_KEY ? "OK" : "MISSING");
console.log("🔑 CONSUMER SECRET:", process.env.CONSUMER_SECRET ? "OK" : "MISSING");
console.log("🔑 PASSKEY:        ", process.env.PASSKEY ? "OK" : "MISSING");
console.log("🔑 SHORTCODE:      ", process.env.BUSINESS_SHORTCODE ? "OK" : "MISSING");
console.log("🔍 RAW SHORTCODE:  ", process.env.BUSINESS_SHORTCODE);

// ─── BOOKING HELPERS ─────────────────────────────────────────
function readBookings() {
  if (!fs.existsSync(BOOKINGS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(BOOKINGS_FILE, "utf8")); }
  catch { return []; }
}

function saveBookings(bookings) {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
}

function updateBookingStatus(ref, status, extraData = {}) {
  const bookings = readBookings();
  const idx = bookings.findIndex(b => b.ref === ref);
  if (idx !== -1) {
    bookings[idx] = { ...bookings[idx], status, ...extraData };
    saveBookings(bookings);
    return bookings[idx];
  }
  return null;
}

// ─── GET ACCESS TOKEN ────────────────────────────────────────
async function getAccessToken() {
  const auth = Buffer.from(
    `${process.env.CONSUMER_KEY}:${process.env.CONSUMER_SECRET}`
  ).toString("base64");
  const response = await axios.get(
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    { headers: { Authorization: "Basic " + auth } }
  );
  return response.data.access_token;
}

function getTimestamp() {
  return new Date().toISOString().replace(/[-T:\.Z]/g, "").slice(0, 14);
}

// ═══════════════════════════════════════════════════════════════
// ROUTE: POST /stkpush
// ═══════════════════════════════════════════════════════════════
app.post("/stkpush", async (req, res) => {
  console.log("\n🔥 STK ROUTE HIT");
  console.log("📦 BODY:", req.body);

  // ✅ FIXED: use BUSINESS_SHORTCODE everywhere
  const shortcode = process.env.BUSINESS_SHORTCODE;
  const passkey   = process.env.PASSKEY;

  console.log("🏦 SHORTCODE:", shortcode);
  console.log("🔑 PASSKEY EXISTS:", !!passkey);

  try {
    let { phone, amount, reference, guestData } = req.body;

    if (!phone || !amount) {
      return res.status(400).json({ error: "Phone and amount are required" });
    }

    // Format phone → 254XXXXXXXXX
    phone = phone.toString().trim();
    if (phone.startsWith("0")) phone = "254" + phone.substring(1);
    else if (phone.startsWith("+")) phone = phone.replace("+", "");
    console.log("📞 FORMATTED PHONE:", phone);

    // Save booking
    if (guestData) {
      const bookings = readBookings();
      const existing = bookings.findIndex(b => b.ref === guestData.ref);
      if (existing === -1) bookings.push({ ...guestData, status: "Pending Payment" });
      else bookings[existing] = { ...bookings[existing], ...guestData, status: "Pending Payment" };
      saveBookings(bookings);
      console.log("💾 Booking saved:", guestData.ref);
    }

    const token = await getAccessToken();
    console.log("🔐 Token acquired");

    const timestamp = getTimestamp();
    const password  = Buffer.from(shortcode + passkey + timestamp).toString("base64");

    const stkData = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.ceil(Number(amount)),
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: process.env.CALLBACK_URL || "https://mpesa-backend-rakq.onrender.com/callback",
      AccountReference: reference || "AIRBNBMSA",
      TransactionDesc: "Airbnb Mombasa Booking",
    };

    console.log("📤 Sending STK request...");
    const response = await axios.post(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      stkData,
      { headers: { Authorization: "Bearer " + token } }
    );

    console.log("✅ STK SUCCESS:", response.data);

    if (guestData?.ref) {
      updateBookingStatus(guestData.ref, "Pending Payment", {
        checkoutRequestId: response.data.CheckoutRequestID,
        merchantRequestId: response.data.MerchantRequestID,
      });
    }

    res.json(response.data);

  } catch (error) {
    console.log("❌ STK ERROR:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ROUTE: POST /callback
// ═══════════════════════════════════════════════════════════════
app.post("/callback", (req, res) => {
  console.log("\n💰 MPESA CALLBACK");
  try {
    const result = req.body?.Body?.stkCallback;
    if (!result) return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    const bookings = readBookings();
    const booking  = bookings.find(b => b.checkoutRequestId === result.CheckoutRequestID);
    if (result.ResultCode === 0) {
      const meta = result.CallbackMetadata?.Item || [];
      const get  = (name) => meta.find(i => i.Name === name)?.Value;
      const paymentInfo = {
        mpesaReceiptNumber: get("MpesaReceiptNumber"),
        transactionDate: get("TransactionDate"),
        paidAmount: get("Amount"),
        paidPhone: get("PhoneNumber"),
      };
      console.log("✅ PAYMENT SUCCESS:", paymentInfo);
      if (booking) updateBookingStatus(booking.ref, "Confirmed", { paymentInfo, paidAt: new Date().toISOString() });
    } else {
      console.log("❌ PAYMENT FAILED:", result.ResultDesc);
      if (booking) updateBookingStatus(booking.ref, "Payment Failed", { failureReason: result.ResultDesc });
    }
  } catch (err) {
    console.error("Callback error:", err.message);
  }
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// ═══════════════════════════════════════════════════════════════
// ROUTE: POST /verify-sms
// ═══════════════════════════════════════════════════════════════
app.post("/verify-sms", (req, res) => {
  const { ref, receiptNo, paidAmt, smsText } = req.body;
  console.log(`\n📩 SMS VERIFY — Ref: ${ref}, Receipt: ${receiptNo}`);
  if (!ref || !receiptNo) return res.status(400).json({ error: "ref and receiptNo required" });
  const updated = updateBookingStatus(ref, "Confirmed", {
    paymentInfo: { mpesaReceiptNumber: receiptNo, paidAmount: paidAmt, verifiedViaSMS: true, smsText, transactionDate: new Date().toISOString() },
    paidAt: new Date().toISOString(),
  });
  if (!updated) return res.status(404).json({ error: "Booking not found" });
  console.log(`✅ SMS verified — ${ref} confirmed`);
  res.json({ success: true, booking: updated });
});

// ═══════════════════════════════════════════════════════════════
// ROUTE: GET /bookings
// ═══════════════════════════════════════════════════════════════
app.get("/bookings", (req, res) => {
  res.json(readBookings());
});

// ═══════════════════════════════════════════════════════════════
// ROUTE: PATCH /bookings/:ref
// ═══════════════════════════════════════════════════════════════
app.patch("/bookings/:ref", (req, res) => {
  const { ref } = req.params;
  const { status } = req.body;
  const allowed = ["Confirmed","Checked In","Checked Out","Cancelled","Pending Payment","Payment Failed"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });
  const extraData = {};
  if (status === "Checked In")  extraData.actualCheckinTime  = new Date().toISOString();
  if (status === "Checked Out") extraData.actualCheckoutTime = new Date().toISOString();
  const updated = updateBookingStatus(ref, status, extraData);
  if (!updated) return res.status(404).json({ error: "Booking not found" });
  console.log(`📝 ${ref} → ${status}`);
  res.json(updated);
});

// ═══════════════════════════════════════════════════════════════
// ROUTE: POST /admin-login
// ═══════════════════════════════════════════════════════════════
app.post("/admin-login", (req, res) => {
  const { password } = req.body;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin2024";
  if (password === ADMIN_PASSWORD) res.json({ success: true });
  else res.status(401).json({ error: "Wrong password" });
});

// ─── START ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}\n`);
});
