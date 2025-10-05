const TelegramClient = require('./telegram-client');
const config = require('./config');

async function testPremiumFeatures() {
  console.log('🧪 Тестирование Поддержки Премиум Функций');
  console.log('==========================================\n');
  
  const client = new TelegramClient();
  
  try {
    // Инициализация клиента
    console.log('📱 Инициализация Telegram клиента...');
    const connected = await client.initialize();
    
    if (!connected) {
      console.error('❌ Не удалось подключиться к Telegram');
      return;
    }
    
    console.log('✅ Успешно подключен к Telegram\n');
    
    // Тестовое сообщение с премиум эмодзи и гиперссылками
    const testMessage = `
🧪 Тестовое Сообщение с Премиум Функциями

🌟 Это сообщение содержит:
• Премиум эмодзи (если доступны)
• Гиперссылки: https://t.me/HeartUkrainePUBG
• Жирный текст: **Это жирный текст**
• Курсивный текст: *Это курсивный текст*
• Код: \`console.log('Привет Мир')\`

🔗 Ссылки:
- HeartUA Official: https://t.me/HeartUA_official
- Heart of Ukraine PUBG: https://t.me/HeartUkrainePUBG

💎 Премиум эмодзи должны сохраняться в этом сообщении!
    `;
    
    // Тест отправки админу (замените на ваш ID админа)
    const adminId = config.ADMIN_ID;
    
    console.log('📤 Отправка тестового сообщения...');
    await client.sendMessage(adminId, testMessage, {
      parseMode: 'html'
    });
    
    console.log('✅ Тестовое сообщение отправлено успешно!');
    console.log('\n📋 Что проверить:');
    console.log('1. Премиум эмодзи должны отображаться корректно');
    console.log('2. Гиперссылки должны быть кликабельными');
    console.log('3. Форматирование текста должно сохраняться');
    console.log('4. Сообщение должно выглядеть точно как задумано');
    
  } catch (error) {
    console.error('❌ Тест не удался:', error.message);
    console.error('Стек вызовов:', error.stack);
  } finally {
    await client.disconnect();
    console.log('\n📱 Отключен от Telegram');
  }
}

// Запуск теста если файл вызван напрямую
if (require.main === module) {
  testPremiumFeatures();
}

module.exports = testPremiumFeatures;
