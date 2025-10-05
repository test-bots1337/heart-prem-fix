const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🚀 Настройка HeartUA Bot - Миграция на Пользовательскую Сессию');
console.log('==============================================================\n');

console.log('Эта настройка поможет вам мигрировать с Bot API на Пользовательскую Сессию для поддержки премиум эмодзи.\n');

async function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function setup() {
  try {
    console.log('📋 Шаг 1: Получение учетных данных Telegram API');
    console.log('1. Перейдите на https://my.telegram.org');
    console.log('2. Войдите с вашим номером телефона');
    console.log('3. Перейдите в "API development tools"');
    console.log('4. Создайте новое приложение');
    console.log('5. Запишите ваш API_ID и API_HASH\n');
    
    const apiId = await askQuestion('Введите ваш API_ID: ');
    const apiHash = await askQuestion('Введите ваш API_HASH: ');
    const phoneNumber = await askQuestion('Введите ваш номер телефона (с кодом страны, например, +1234567890): ');
    
    console.log('\n📋 Шаг 2: Создание файла окружения');
    
    const envContent = `# Конфигурация Пользовательской Сессии Telegram
TELEGRAM_API_ID=${apiId}
TELEGRAM_API_HASH=${apiHash}
TELEGRAM_PHONE=${phoneNumber}
TELEGRAM_CODE=
TELEGRAM_2FA=
TELEGRAM_SESSION=

# Bot API Token (для обратной совместимости)
BOT_TOKEN=8450873434:AAHvesGdrR0xf47BFv1hyRHFsJorZO1P9xo
`;

    fs.writeFileSync('.env', envContent);
    console.log('✅ Создан файл .env');
    
    console.log('\n📋 Шаг 3: Установка зависимостей');
    console.log('Выполните: npm install');
    
    console.log('\n📋 Шаг 4: Миграция базы данных');
    console.log('Выполните: node migrate-database.js');
    
    console.log('\n📋 Шаг 5: Запуск нового бота');
    console.log('Выполните: node index-new.js');
    
    console.log('\n📋 Шаг 6: Первичная аутентификация');
    console.log('1. Бот попросит код верификации телефона');
    console.log('2. Введите код, полученный через SMS');
    console.log('3. Если у вас включена 2FA, введите ваш пароль');
    console.log('4. Бот сохранит строку сессии для будущего использования');
    
    console.log('\n🎉 Настройка завершена!');
    console.log('\nКлючевые преимущества новой реализации:');
    console.log('✅ Премиум эмодзи сохраняются');
    console.log('✅ Гиперссылки работают корректно');
    console.log('✅ Сообщения отправляются точно так, как их отправил бы пользователь');
    console.log('✅ Все оригинальное форматирование сохраняется');
    
    console.log('\n📝 Важные заметки:');
    console.log('- Храните файл .env в безопасности и никогда не коммитьте его в систему контроля версий');
    console.log('- Строка сессии будет сохранена после первой аутентификации');
    console.log('- Вы можете повторно использовать строку сессии, установив TELEGRAM_SESSION в .env');
    console.log('- Убедитесь, что ваш аккаунт Telegram имеет доступ к целевым каналам');
    
  } catch (error) {
    console.error('❌ Настройка не удалась:', error.message);
  } finally {
    rl.close();
  }
}

setup();
