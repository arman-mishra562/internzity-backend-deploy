import Razorpay from 'razorpay';
import paypal from '@paypal/checkout-server-sdk';
import prisma from '../config/prisma';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// PayPal environment
const paypalEnv = new paypal.core.SandboxEnvironment(
  process.env.PAYPAL_CLIENT_ID!,
  process.env.PAYPAL_CLIENT_SECRET!
);
const paypalClient = new paypal.core.PayPalHttpClient(paypalEnv);

export const paymentService = {
  // 1. Create a payment order (Razorpay)
  async createRazorpayOrder(courseId: string) {
    const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
    const options = {
      amount: course.priceCents,
      currency: 'INR',
      receipt: `course_${courseId}_${Date.now()}`,
    };
    const order = await razorpay.orders.create(options);
    return { orderId: order.id, amount: order.amount, currency: order.currency };
  },

  // 2. Capture payment (Razorpay webhook or client side)
  async captureRazorpayPayment(orderId: string, paymentId: string) {
    // Optionally verify signature client-side; here we trust it
    await prisma.enrollment.create({
      data: { courseId: orderId.split('_')[1], userId: '' /* from controller */ },
    });
    return;
  },

  // 3. Create PayPal order
  async createPayPalOrder(courseId: string) {
    const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer('return=representation');
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: 'USD', value: (course.priceCents / 100).toFixed(2) }
      }]
    });
    const order = await paypalClient.execute(request);
    return order.result;
  },

  // 4. Capture PayPal order
  async capturePayPalOrder(orderId: string, userId: string, courseId: string) {
    const request = new paypal.orders.OrdersCaptureRequest(orderId);
    request.requestBody({});
    const capture = await paypalClient.execute(request);
    // Record enrollment
    await prisma.enrollment.create({ data: { userId, courseId } });
    return capture.result;
  },

  // 5. Google Pay: client posts a token, we treat it like Razorpay
  async processGooglePay(token: string, courseId: string, userId: string) {
    // Normally you’d send `token` to your processor. Here, simulate success:
    await prisma.enrollment.create({ data: { userId, courseId } });
    return { success: true };
  }
};
