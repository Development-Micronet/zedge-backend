require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { BrevoClient } = require("@getbrevo/brevo");

const app = express();
const PORT = process.env.PORT || 5000;
const IS_DEVELOPMENT = process.env.NODE_ENV !== "production";
const USE_BREVO_DEV_FALLBACK = process.env.BREVO_DEV_FALLBACK === "true";

app.use(cors(
  { origin: [
      "http://localhost:5500", // Vite
      "http://localhost:3000", // React
      "https://z-edge.in",
    ],
    methods: ["GET", "POST"],
    credentials: true,}
));
app.use(express.json());

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Z Edge Backend</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #f7f4ea;
            color: #29461f;
            padding: 40px;
          }
          code {
            background: #eae4d3;
            padding: 4px 8px;
            border-radius: 6px;
          }
        </style>
      </head>
      <body>
        <h1>Z Edge Backend is running</h1>
        <p>Contact form endpoint: <code>POST /send-inquiry</code></p>
        <p>Health check: <code>GET /health</code></p>
      </body>
    </html>
  `);
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Z Edge backend is running",
    port: PORT,
  });
});




function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getRequiredEnv(name) {
  return clean(process.env[name]);
}

function getBrevoErrorMessage(error) {
  const message =
    error?.response?.body?.message ||
    error?.response?.body?.error ||
    error?.response?.text ||
    error?.response?.statusText ||
    error?.body?.message ||
    error?.message;

  return typeof message === "string" && message.trim().length > 0
    ? message.trim()
    : "Failed to send email";
}

app.post("/send-inquiry", async (req, res) => {
  try {
    const inquiry = {
      source: clean(req.body.source) || "Website form",
      service: clean(req.body.service) || "General inquiry",
      name: clean(req.body.name),
      email: clean(req.body.email),
      phone: clean(req.body.phone),
      message: clean(req.body.message),
    };

    if (!inquiry.name || !inquiry.email || !inquiry.phone) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and phone are required",
      });
    }

    const isDevFallback = IS_DEVELOPMENT && USE_BREVO_DEV_FALLBACK;

    if (!process.env.BREVO_API_KEY && !isDevFallback) {
      return res.status(500).json({
        success: false,
        message: "BREVO_API_KEY is not configured",
      });
    }

    if (isDevFallback) {
      console.log(
        "Brevo dev fallback enabled. Simulating email send.",
        inquiry,
      );
      return res.json({
        success: true,
        message: "Inquiry simulated successfully in development mode",
      });
    }

    const senderEmail = getRequiredEnv("BREVO_SENDER_EMAIL");
    const receiverEmail = getRequiredEnv("INQUIRY_RECEIVER_EMAIL");

    if (!senderEmail || !receiverEmail) {
      return res.status(500).json({
        success: false,
        message:
          "Email settings missing. Add BREVO_SENDER_EMAIL and INQUIRY_RECEIVER_EMAIL in .env",
      });
    }

    const brevoClient = new BrevoClient({
      apiKey: process.env.BREVO_API_KEY,
    });

    await brevoClient.transactionalEmails.sendTransacEmail({
      subject: `New Counselling Inquiry - ${inquiry.service}`,
      sender: {
        name: "Z Edge Counselling",
        email: senderEmail,
      },
      to: [
        {
          email: receiverEmail,
        },
      ],
      replyTo: {
        email: inquiry.email,
        name: inquiry.name,
      },
      htmlContent: `
      <h2>New Inquiry</h2>

      <p><strong>Source:</strong> ${escapeHtml(inquiry.source)}</p>
      <p><strong>Service:</strong> ${escapeHtml(inquiry.service)}</p>
      <p><strong>Name:</strong> ${escapeHtml(inquiry.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(inquiry.email)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(inquiry.phone)}</p>
      <p><strong>Message:</strong> ${escapeHtml(inquiry.message || "No message provided")}</p>
    `,
    });

    res.json({
      success: true,
      message: "Email sent successfully",
    });
  } catch (error) {
    const errorMessage = getBrevoErrorMessage(error);
    console.error("Inquiry email failed:", errorMessage, error);
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

server.on("error", (error) => {
  console.error("Server failed to start:", error.message);
  process.exit(1);
});
