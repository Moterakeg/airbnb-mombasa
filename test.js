console.log("🚀 Test file started");

const axios = require("axios");

(async () => {
  try {
    console.log("📡 Sending request...");

    const res = await axios.post("http://127.0.0.1:3000/stkpush", {
      phone: "254746038656",
      amount: 4500,
      reference: "TEST123"
    });

    console.log("✅ RESPONSE RECEIVED:");
    console.log(res.data);

  } catch (err) {
    console.log("❌ ERROR:");
    console.log(err.response?.data || err.message);
  }
})();