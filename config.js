module.exports = {
  // Bot API Token (for backward compatibility)
  BOT_TOKEN: '8450873434:AAHvesGdrR0xf47BFv1hyRHFsJorZO1P9xo',
  
  // Telegram User Session Configuration
  API_ID: process.env.TELEGRAM_API_ID || 'YOUR_API_ID', // Get from https://my.telegram.org
  API_HASH: process.env.TELEGRAM_API_HASH || 'YOUR_API_HASH', // Get from https://my.telegram.org
  PHONE_NUMBER: process.env.TELEGRAM_PHONE || '+1234567890', // Your phone number
  PHONE_CODE: process.env.TELEGRAM_CODE || '', // Phone verification code (if needed)
  TWO_FA_PASSWORD: process.env.TELEGRAM_2FA || '', // 2FA password (if enabled)
  SESSION_STRING: process.env.TELEGRAM_SESSION || '', // Saved session string
  
  ADMIN_IDS: [8314279580, 731157717], // Список адміністраторів
  ADMIN_ID: 8314279580, // Головний адмін (для сумісності)
  
  // ID каналу/групи для публікації оголошень (залиште null, щоб публікувати в чат з адміном)
  // Формат: -100123456789 для супергруп з темами
  ANNOUNCEMENTS_CHANNEL: '@HeartUkrainePUBG',
  
  // Відповідність категорій до ID тем (topics) в супергрупі
  // Залиште null якщо не використовуєте теми, або вкажіть ID теми для кожної категорії
  CATEGORIES: {
    'free_agent': { name: '🎮 Free Agent', topicId: 11 },
    'clan_recruitment': { name: '👥 Набір у клан', topicId: 12 },
    'custom': { name: '🎯 Кастомки', topicId: 13 },
    'practice': { name: '🏋️ Праки', topicId: 14 },
    'tdm': { name: '⚔️ TDM', topicId: 15 },
    'giveaway': { name: '🎁 Розіграші', topicId: 16 }
  },
  
  UC_PACKAGES: [
    { amount: 60, price: 38 },
    { amount: 120, price: 80 },
    { amount: 180, price: 115 },
    { amount: 325, price: 190 },
    { amount: 660, price: 370 },
    { amount: 985, price: 560 },
    { amount: 1320, price: 740 },
    { amount: 1800, price: 900 },
    { amount: 2460, price: 1300 },
    { amount: 3850, price: 1800 },
    { amount: 5650, price: 2650 },
    { amount: 8100, price: 3600 },
    { amount: 11950, price: 5400 },
    { amount: 16200, price: 7200 },
    { amount: 24300, price: 10800 },
    { amount: 32400, price: 14500 },
    { amount: 40500, price: 18300 }
  ],
  
  STARS_PACKAGES: [
    { amount: 50, price: 40 },
    { amount: 100, price: 75 },
    { amount: 150, price: 120 },
    { amount: 200, price: 150 },
    { amount: 250, price: 195 },
    { amount: 300, price: 235 },
    { amount: 400, price: 310 },
    { amount: 500, price: 385 },
    { amount: 750, price: 580 },
    { amount: 1000, price: 760 },
    { amount: 1500, price: 1150 },
    { amount: 2500, price: 1900 }
  ],
  
  PREMIUM_SERVICES: {
    'autopost_6': { name: 'Автопост 6 годин', duration: 6, price: 50 },
    'autopost_12': { name: 'Автопост 12 годин', duration: 12, price: 90 },
    'autopost_24': { name: 'Автопост 24 години', duration: 24, price: 150 },
    'pin_24': { name: 'Закріп на 24 години', duration: 24, price: 100 }
  },
  
  MAX_PINNED_POSTS: 3,
  
  PAYMENT_INFO: '💳 Реквізити для оплати:\n\n🔹 Монобанк: 5375 4141 XXXX XXXX\n🔹 ПриватБанк: 5168 7422 XXXX XXXX\n\n📸 Після оплати надішліть скріншот квитанції'
};

