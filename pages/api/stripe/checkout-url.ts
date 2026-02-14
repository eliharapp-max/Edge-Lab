export default function handler(req: any, res: any) {
    return res.status(200).json({
      url: "https://example.com",
      source: "checkout-url",
      time: Date.now(),
    });
  }
  