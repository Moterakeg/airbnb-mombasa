fetch("https://mpesa-backend-rakq.onrender.com/stkpush", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    phone: "254746038656",
    amount: 1
  })
})