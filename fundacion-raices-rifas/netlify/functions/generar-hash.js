const crypto = require("crypto");

exports.handler = async (event) => {
  // Solo aceptar peticiones POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Método no permitido" }),
    };
  }

  try {
    const { orderId, amount, currency } = JSON.parse(event.body);

    if (!orderId || !amount || !currency) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Faltan datos: orderId, amount y currency son obligatorios",
        }),
      };
    }

    const llaveSecreta = process.env.BOLD_API_KEY_SECRETA;

    if (!llaveSecreta) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Falta configurar BOLD_API_KEY_SECRETA en Netlify",
        }),
      };
    }

    const cadenaConcatenada = `${orderId}${amount}${currency}${llaveSecreta}`;

    const hash = crypto
      .createHash("sha256")
      .update(cadenaConcatenada, "utf8")
      .digest("hex");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ hash }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error generando el hash", details: error.message }),
    };
  }
};
