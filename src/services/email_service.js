const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      // Additional options for better reliability
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    });

    // Verify transporter configuration
    this.transporter.verify((error, success) => {
      if (error) {
        console.error('Email service configuration error:', error);
      } else {
        console.log('Email service ready');
      }
    });
  }

  async sendOTP(email, otp, name = '') {
    const mailOptions = {
      from: {
        name: 'Guidera',
        address: process.env.SMTP_USER
      },
      to: email,
      subject: 'Your OTP Code - Guidera',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Your OTP Code</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
            .header h1 { font-size: 28px; margin-bottom: 10px; }
            .header p { font-size: 16px; opacity: 0.9; }
            .content { padding: 40px 30px; background-color: #f8f9fa; }
            .greeting { font-size: 18px; margin-bottom: 20px; color: #333; }
            .message { font-size: 16px; margin-bottom: 30px; color: #555; }
            .otp-container { text-align: center; margin: 30px 0; }
            .otp-code { 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
              color: white; 
              padding: 20px 30px; 
              font-size: 32px; 
              font-weight: bold; 
              border-radius: 12px; 
              letter-spacing: 6px; 
              display: inline-block;
              box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
            }
            .warning { 
              background-color: #fff3cd; 
              border: 1px solid #ffeaa7; 
              color: #856404; 
              padding: 15px; 
              border-radius: 8px; 
              margin: 20px 0; 
              font-size: 14px;
            }
            .footer { 
              background-color: #f1f3f5; 
              padding: 30px 20px; 
              text-align: center; 
              border-top: 1px solid #dee2e6; 
            }
            .footer p { color: #6c757d; font-size: 14px; margin: 5px 0; }
            .security-tip { 
              background-color: #e3f2fd; 
              border-left: 4px solid #2196f3; 
              padding: 15px; 
              margin: 20px 0; 
              font-size: 14px; 
              color: #1565c0; 
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎓 Guidera</h1>
              <p>Your Educational Journey Partner</p>
            </div>
            <div class="content">
              <div class="greeting">Hello${name ? ' ' + name : ''}! 👋</div>
              <div class="message">
                You requested an OTP code to access your Guidera account. Please use the code below to continue:
              </div>
              <div class="otp-container">
                <div class="otp-code">${otp}</div>
              </div>
              <div class="warning">
                <strong>⚠️ Important:</strong> This code will expire in <strong>10 minutes</strong>. 
                Please use it immediately to complete your login.
              </div>
              <div class="security-tip">
                <strong>🔒 Security Tip:</strong> Never share this OTP with anyone. Guidera will never ask for your OTP via phone or email.
              </div>
              <p style="color: #6c757d; font-size: 14px; margin-top: 20px;">
                If you didn't request this code, please ignore this email or contact our support team immediately.
              </p>
            </div>
            <div class="footer">
              <p><strong>&copy; 2025 Guidera. All rights reserved.</strong></p>
              <p>This is an automated security message, please do not reply to this email.</p>
              <p style="margin-top: 15px; font-size: 12px;">
                Need help? Contact us at support@guidera.app
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('OTP email sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('OTP email sending failed:', error);
      return { success: false, error: error.message };
    }
  }

  async sendPasswordReset(email, resetToken, name = '') {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: {
        name: 'Guidera',
        address: process.env.SMTP_USER
      },
      to: email,
      subject: 'Password Reset Request - Guidera',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset Request</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
            .header h1 { font-size: 28px; margin-bottom: 10px; }
            .header p { font-size: 16px; opacity: 0.9; }
            .content { padding: 40px 30px; background-color: #f8f9fa; }
            .greeting { font-size: 18px; margin-bottom: 20px; color: #333; }
            .message { font-size: 16px; margin-bottom: 30px; color: #555; }
            .button-container { text-align: center; margin: 30px 0; }
            .reset-button { 
              display: inline-block; 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
              color: white; 
              padding: 16px 32px; 
              text-decoration: none; 
              border-radius: 12px; 
              font-weight: bold; 
              font-size: 16px;
              box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
              transition: transform 0.2s ease;
            }
            .reset-button:hover { transform: translateY(-2px); }
            .url-fallback { 
              background-color: #f8f9fa; 
              border: 1px solid #dee2e6; 
              padding: 15px; 
              border-radius: 8px; 
              margin: 20px 0; 
              word-break: break-all; 
              font-size: 14px; 
              color: #495057; 
            }
            .warning { 
              background-color: #fff3cd; 
              border: 1px solid #ffeaa7; 
              color: #856404; 
              padding: 15px; 
              border-radius: 8px; 
              margin: 20px 0; 
              font-size: 14px;
            }
            .security-tip { 
              background-color: #e3f2fd; 
              border-left: 4px solid #2196f3; 
              padding: 15px; 
              margin: 20px 0; 
              font-size: 14px; 
              color: #1565c0; 
            }
            .footer { 
              background-color: #f1f3f5; 
              padding: 30px 20px; 
              text-align: center; 
              border-top: 1px solid #dee2e6; 
            }
            .footer p { color: #6c757d; font-size: 14px; margin: 5px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎓 Guidera</h1>
              <p>Your Educational Journey Partner</p>
            </div>
            <div class="content">
              <div class="greeting">Hello${name ? ' ' + name : ''}! 👋</div>
              <div class="message">
                We received a request to reset your password for your Guidera account. 
                Click the button below to create a new password:
              </div>
              <div class="button-container">
                <a href="${resetUrl}" class="reset-button">🔐 Reset My Password</a>
              </div>
              <div class="warning">
                <strong>⚠️ Important:</strong> This reset link will expire in <strong>1 hour</strong>. 
                Please use it promptly to reset your password.
              </div>
              <div style="margin: 20px 0;">
                <p style="font-size: 14px; color: #6c757d; margin-bottom: 10px;">
                  If the button doesn't work, copy and paste this link into your web browser:
                </p>
                <div class="url-fallback">${resetUrl}</div>
              </div>
              <div class="security-tip">
                <strong>🔒 Security Tip:</strong> If you didn't request this password reset, please ignore this email. 
                Your account remains secure and no changes have been made.
              </div>
              <p style="color: #6c757d; font-size: 14px; margin-top: 20px;">
                If you continue to have problems or didn't request this reset, please contact our support team immediately.
              </p>
            </div>
            <div class="footer">
              <p><strong>&copy; 2025 Guidera. All rights reserved.</strong></p>
              <p>This is an automated security message, please do not reply to this email.</p>
              <p style="margin-top: 15px; font-size: 12px;">
                Need help? Contact us at support@guidera.app
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('Password reset email sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Password reset email sending failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Test email connection
  async testConnection() {
    try {
      await this.transporter.verify();
      return { success: true, message: 'Email service connection successful' };
    } catch (error) {
      console.error('Email service test failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();