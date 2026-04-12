require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

// 🔍 ENV CHECK
console.log("🔑 CONSUMER KEY:", process.env.CONSUMER_KEY ? "OK" : "MISSING");
console.log("🔑 CONSUMER SECRET:", process.env.CONSUMER_SECRET ? "OK" : "MISSING");
console.log("🔑 PASSKEY:", process.env.PASSKEY ? "OK" : "MISSING");
console.log("🔑 SHORTCODE:", process.env.SHORTCODE ? "OK" : "MISSING");

// 🔐 ACCESS TOKEN
async function getAccessToken() {
  const url =
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";

  const auth = Buffer.from(
    `${process.env.CONSUMER_KEY}:${process.env.CONSUMER_SECRET}`
  ).toString("base64");

  const response = await axios.get(url, {
    headers: {
      Authorization: "Basic " + auth,
    },
  });

  return response.data.access_token;
}

// 📱 STK PUSH
app.post("/stkpush", async (req, res) => {console.log("🔥 STK ROUTE HIT");
console.log("BODY:", req.body);
console.log("SHORTCODE:", process.env.SHORTCODE);
console.log("PASSKEY EXISTS:", !!process.env.PASSKEY);
  try {
    let { phone, amount, reference } = req.body;

    if (!phone || !amount) {
      return res.status(400).json({ error: "Phone and amount required" });
    }

    // format phone
    if (phone.startsWith("0")) phone = "254" + phone.substring(1);
    if (phone.startsWith("+")) phone = phone.replace("+", "");

    const token = await getAccessToken();

    const timestamp = new Date()
      .toISOString()
      .replace(/[-T:\.Z]/g, "")
      .slice(0, 14);

    const password = Buffer.from(
      process.env.SHORTCODE + process.env.PASSKEY + timestamp
    ).toString("base64");

    const stkData = {
      BusinessShortCode: process.env.SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phone,
      PartyB: process.env.SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: process.env.CALLBACK_URL,
      AccountReference: reference || "BOOKING",
      TransactionDesc: "Payment",
    };

    const response = await axios.post(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      stkData,
      {
        headers: {
          Authorization: "Bearer " + token,
        },
      }
    );

    res.json(response.data);

  } catch (error) {
    res.status(500).json({
      error: error.response?.data || error.message,
    });
  }
});

// 🚀 START
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});