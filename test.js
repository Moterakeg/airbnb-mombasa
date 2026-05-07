console.log("🚀 Test file started");

const axios = require("axios");

(async () => {
  try {
    console.log("📡 Sending request...");

    const res = await axios.post("https://mpesa-backend-rakq.onrender.com/stkpush", {
      phone: "254769085318",
      amount: 4500,
      reference: "TEST123"
    });

    console.log("✅ RESPONSE RECEIVED:");
    console.log(res.data);
  } catch (error) {
    console.log("❌ FULL ERROR OBJECT:");
    console.log(error);

  console.log("❌ RESPONSE DATA:");
  console.log(error.response?.data);

  console.log("❌ STATUS:");
  console.log(error.response?.status);

  console.log("❌ MESSAGE:");
  console.log(error.message);

  return res.status(500).json({
    error: error.response?.data || error.message
  });
}