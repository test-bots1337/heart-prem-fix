const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const db = require('./database');
const config = require('./config');

const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });

// Тимчасове сховище для стану користувачів
const userStates = {};

// Додавання користувача в базу
async function addUser(userId, userData) {
  try {
    await db.runAsync(`
      INSERT OR REPLACE INTO users (id, username, first_name, last_name)
      VALUES (?, ?, ?, ?)
    `, [userId, userData.username || null, userData.first_name || null, userData.last_name || null]);
  } catch (error) {
    console.error('Помилка додавання користувача:', error);
  }
}

// Перевірка чи користувач адмін
function isAdmin(userId) {
  if (config.ADMIN_IDS && Array.isArray(config.ADMIN_IDS)) {
    return config.ADMIN_IDS.includes(userId);
  }
  return userId === config.ADMIN_ID;
}

// Отримання назви категорії
function getCategoryName(categoryKey) {
  const category = config.CATEGORIES[categoryKey];
  return typeof category === 'string' ? category : category.name;
}

// Отримання ID теми для категорії
function getCategoryTopicId(categoryKey) {
  const category = config.CATEGORIES[categoryKey];
  return typeof category === 'object' ? category.topicId : null;
}

// Відправка повідомлення всім адмінам
async function sendToAllAdmins(message, options = {}) {
  const adminIds = config.ADMIN_IDS && Array.isArray(config.ADMIN_IDS) 
    ? config.ADMIN_IDS 
    : [config.ADMIN_ID];
  
  for (const adminId of adminIds) {
    try {
      if (options.photo) {
        await bot.sendPhoto(adminId, options.photo, { caption: message, ...options });
      } else {
        await bot.sendMessage(adminId, message, options);
      }
    } catch (error) {
      console.error(`Помилка відправки адміну ${adminId}:`, error.message);
    }
  }
}

// Перевірка підписки на канали
async function checkSubscriptions(userId) {
  try {
    const channels = await db.allAsync('SELECT channel_id FROM required_channels');
    
    if (channels.length === 0) {
      return true; // Якщо немає обов'язкових каналів, пропускаємо
    }
    
    for (const channel of channels) {
      try {
        const member = await bot.getChatMember(channel.channel_id, userId);
        if (['left', 'kicked'].includes(member.status)) {
          return false;
        }
      } catch (error) {
        console.error(`Помилка перевірки підписки на ${channel.channel_id}:`, error.message);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Помилка перевірки підписок:', error);
    return true;
  }
}

// Головне меню
function getMainMenu() {
  return {
    reply_markup: {
      keyboard: [
        ['📢 Оголошення', '💎 Преміум-послуги'],
        ['🛒 Магазин'],
        ['📺 Наші офіційні канали', '❓ Допомога'],
        ['👨‍💼 Адміни']
      ],
      resize_keyboard: true
    }
  };
}

// Адмін меню
function getAdminMenu() {
  return {
    reply_markup: {
      keyboard: [
        ['📋 Модерація', '📺 Канали'],
        ['👥 Користувачі', '📌 Закріпи'],
        ['📨 Розсилка', '🔙 Головне меню']
      ],
      resize_keyboard: true
    }
  };
}

// Меню категорій оголошень
function getCategoriesMenu() {
  const buttons = Object.entries(config.CATEGORIES).map(([key, value]) => [{
    text: getCategoryName(key),
    callback_data: `category_${key}`
  }]);
  
  return {
    reply_markup: {
      inline_keyboard: [...buttons, [{ text: '❌ Скасувати', callback_data: 'cancel' }]]
    }
  };
}

// Команда /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  await addUser(userId, msg.from);
  
  let welcomeText = '👋 Вітаємо в HeartUA Bot!\n\n';
  welcomeText += 'Оберіть розділ з меню нижче:';
  
  if (isAdmin(userId)) {
    bot.sendMessage(chatId, welcomeText + '\n\n🔐 Ви увійшли як адміністратор', getMainMenu());
  } else {
    bot.sendMessage(chatId, welcomeText, getMainMenu());
  }
});

// Команда /admin
bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (isAdmin(userId)) {
    bot.sendMessage(chatId, '🔐 Адмін-панель:', getAdminMenu());
  } else {
    bot.sendMessage(chatId, '❌ У вас немає доступу до адмін-панелі');
  }
});

// Обробка повідомлень
bot.on('message', async (msg) => {
  if (msg.text && msg.text.startsWith('/')) return; // Ігноруємо команди
  
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  
  await addUser(userId, msg.from);
  
  // Показати ID теми для адміна (коли пересилає повідомлення з теми)
  if (isAdmin(userId) && msg.forward_from_message_id && msg.message_thread_id) {
    bot.sendMessage(chatId, `📌 ID теми (Topic ID): ${msg.message_thread_id}\n\nВставте це значення в config.js для відповідної категорії!`);
    return;
  }
  
  // Показати message_thread_id якщо є
  if (isAdmin(userId) && msg.message_thread_id) {
    bot.sendMessage(chatId, `📌 Message Thread ID: ${msg.message_thread_id}`);
  }
  
  // Обробка станів користувача (включно з фото)
  if (userStates[userId]) {
    await handleUserState(userId, chatId, msg);
    return;
  }
  
  // Якщо немає тексту і немає стану - ігноруємо
  if (!text) return;
  
  switch (text) {
    case '📢 Оголошення':
      bot.sendMessage(chatId, '📢 Оберіть категорію оголошення:', getCategoriesMenu());
      break;
      
    case '💎 Преміум-послуги':
      showPremiumServices(chatId);
      break;
      
    case '🛒 Магазин':
      showShopMenu(chatId);
      break;
      
    case '📺 Наші офіційні канали':
      showOfficialChannels(chatId);
      break;
      
    case '❓ Допомога':
      showHelp(chatId);
      break;
      
    case '👨‍💼 Адміни':
      showAdmins(chatId);
      break;
      
    case '🔙 Головне меню':
      bot.sendMessage(chatId, 'Головне меню:', getMainMenu());
      break;
      
    // Адмін функції
    case '📋 Модерація':
      if (isAdmin(userId)) {
        await showModeration(chatId);
      }
      break;
      
    case '📺 Канали':
      if (isAdmin(userId)) {
        await showChannelsManagement(chatId);
      }
      break;
      
    case '👥 Користувачі':
      if (isAdmin(userId)) {
        await showUsers(chatId);
      }
      break;
      
    case '📌 Закріпи':
      if (isAdmin(userId)) {
        await showPinnedPosts(chatId);
      }
      break;
      
    case '📨 Розсилка':
      if (isAdmin(userId)) {
        startBroadcast(chatId, userId);
      }
      break;
  }
});

// Обробка callback query
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;
  
  bot.answerCallbackQuery(query.id);
  
  if (data.startsWith('category_')) {
    const category = data.replace('category_', '');
    
    // Перевіряємо чи це вибір категорії для автопосту
    if (userStates[userId] && userStates[userId].action === 'premium_service' && userStates[userId].step === 'select_category') {
      userStates[userId].category = category;
      userStates[userId].step = 'create_announcement';
      bot.sendMessage(chatId, `📝 Напишіть текст оголошення для категорії "${getCategoryName(category)}":\n\n(або надішліть фото з описом)`);
    } else {
      // Звичайне створення оголошення
      startAnnouncementCreation(userId, chatId, category);
    }
  } else if (data.startsWith('approve_ann_')) {
    const annId = parseInt(data.replace('approve_ann_', ''));
    await approveAnnouncement(chatId, annId);
  } else if (data.startsWith('reject_ann_')) {
    const annId = parseInt(data.replace('reject_ann_', ''));
    await rejectAnnouncement(chatId, annId);
  } else if (data.startsWith('premium_select_')) {
    // Формат: premium_select_autopost_6_123 (service_announcementId)
    const parts = data.replace('premium_select_', '').split('_');
    const announcementId = parts.pop(); // Останнє число - ID оголошення
    const service = parts.join('_'); // Залишок - назва сервісу
    await confirmPremiumService(userId, chatId, service, parseInt(announcementId));
  } else if (data.startsWith('premium_')) {
    const service = data.replace('premium_', '');
    await startPremiumService(userId, chatId, service);
  } else if (data.startsWith('uc_')) {
    const index = parseInt(data.replace('uc_', ''));
    startUCOrder(userId, chatId, index);
  } else if (data.startsWith('stars_')) {
    const index = parseInt(data.replace('stars_', ''));
    startStarsOrder(userId, chatId, index);
  } else if (data.startsWith('approve_premium_')) {
    const serviceId = parseInt(data.replace('approve_premium_', ''));
    await approvePremiumService(chatId, serviceId);
  } else if (data.startsWith('reject_premium_')) {
    const serviceId = parseInt(data.replace('reject_premium_', ''));
    await rejectPremiumService(chatId, serviceId);
  } else if (data.startsWith('approve_shop_')) {
    const orderId = parseInt(data.replace('approve_shop_', ''));
    await approveShopOrder(chatId, orderId);
  } else if (data.startsWith('reject_shop_')) {
    const orderId = parseInt(data.replace('reject_shop_', ''));
    await rejectShopOrder(chatId, orderId);
  } else if (data === 'shop_uc') {
    showUCShop(chatId);
  } else if (data === 'shop_stars') {
    showStarsShop(chatId);
  } else if (data === 'shop_back') {
    showShopMenu(chatId);
  } else if (data === 'cancel') {
    delete userStates[userId];
    bot.sendMessage(chatId, '❌ Скасовано', getMainMenu());
  } else if (data.startsWith('add_channel')) {
    startAddChannel(userId, chatId);
  } else if (data.startsWith('remove_channel_')) {
    const channelId = data.replace('remove_channel_', '');
    await removeChannel(chatId, channelId);
  }
});

// Створення оголошення
function startAnnouncementCreation(userId, chatId, category) {
  userStates[userId] = {
    action: 'create_announcement',
    category: category,
    step: 'text'
  };
  
  bot.sendMessage(chatId, `📝 Напишіть текст оголошення для категорії "${getCategoryName(category)}":\n\n(або надішліть фото з описом)`);
}

// Обробка стану користувача
async function handleUserState(userId, chatId, msg) {
  const state = userStates[userId];
  
  if (state.action === 'create_announcement') {
    if (state.step === 'text') {
      const text = msg.caption || msg.text;
      const photo = msg.photo ? msg.photo[msg.photo.length - 1].file_id : null;
      
      if (!text && !photo) {
        bot.sendMessage(chatId, '❌ Будь ласка, надішліть текст або фото з описом');
        return;
      }
      
      // Перевірка підписки
      const isSubscribed = await checkSubscriptions(userId);
      
      if (!isSubscribed) {
        const channels = await db.allAsync('SELECT channel_name, channel_id FROM required_channels');
        let message = '⚠️ Для публікації оголошення необхідно підписатися на канали:\n\n';
        channels.forEach(ch => {
          message += `📺 ${ch.channel_name}\n`;
        });
        bot.sendMessage(chatId, message);
        delete userStates[userId];
        return;
      }
      
      // Збереження оголошення
      const result = await db.runAsync(`
        INSERT INTO announcements (user_id, category, text, photo, status)
        VALUES (?, ?, ?, ?, 'pending')
      `, [userId, state.category, text, photo]);
      
      bot.sendMessage(chatId, '✅ Ваше оголошення відправлено на модерацію!\n\nОчікуйте підтвердження від адміністратора.', getMainMenu());
      
      // Повідомлення адміну
      await notifyAdminNewAnnouncement(result.lastID);
      
      delete userStates[userId];
    }
  } else if (state.action === 'premium_service') {
    if (state.step === 'payment') {
      if (!msg.photo) {
        bot.sendMessage(chatId, '❌ Будь ласка, надішліть скріншот квитанції');
        return;
      }
      
      const photo = msg.photo[msg.photo.length - 1].file_id;
      
      const result = await db.runAsync(`
        INSERT INTO premium_services (user_id, service_type, announcement_id, duration, payment_screenshot, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `, [userId, state.service, state.announcementId || null, config.PREMIUM_SERVICES[state.service].duration, photo]);
      
      bot.sendMessage(chatId, '✅ Запит на преміум-послугу відправлено!\n\nОчікуйте підтвердження від адміністратора.', getMainMenu());
      
      await notifyAdminNewPremiumService(result.lastID);
      
      delete userStates[userId];
    } else if (state.step === 'select_category') {
      // Вибір категорії для автопосту після активації
      bot.sendMessage(chatId, '📢 Оберіть категорію оголошення:', getCategoriesMenu());
    } else if (state.step === 'create_announcement') {
      // Створення оголошення для автопосту
      const text = msg.caption || msg.text;
      const photo = msg.photo ? msg.photo[msg.photo.length - 1].file_id : null;
      
      if (!text && !photo) {
        bot.sendMessage(chatId, '❌ Будь ласка, надішліть текст або фото з описом');
        return;
      }
      
      // Створюємо оголошення і одразу активуємо автопост
      const annResult = await db.runAsync(`
        INSERT INTO announcements (user_id, category, text, photo, status)
        VALUES (?, ?, ?, ?, 'approved')
      `, [userId, state.category, text, photo]);
      
      // Оновлюємо premium_service з announcement_id
      await db.runAsync(`
        UPDATE premium_services
        SET announcement_id = ?
        WHERE id = ?
      `, [annResult.lastID, state.premiumServiceId]);
      
      // Публікуємо перший раз одразу
      const categoryName = getCategoryName(state.category);
      const topicId = getCategoryTopicId(state.category);
      const publishChannel = config.ANNOUNCEMENTS_CHANNEL || chatId;
      
      const options = {};
      if (topicId) options.message_thread_id = topicId;
      
      try {
        if (photo) {
          await bot.sendPhoto(publishChannel, photo, {
            caption: `🔄 ${categoryName}\n\n${text || ''}`,
            ...options
          });
        } else {
          await bot.sendMessage(publishChannel, `🔄 ${categoryName}\n\n${text}`, options);
        }
        
        bot.sendMessage(chatId, `✅ Автопост запущено!\n\n📢 Ваше оголошення буде публікуватись кожну годину протягом ${config.PREMIUM_SERVICES[state.service].duration} годин.`, getMainMenu());
      } catch (error) {
        bot.sendMessage(chatId, '❌ Помилка публікації. Зверніться до адміністратора.', getMainMenu());
        console.error('Помилка публікації автопосту:', error);
      }
      
      delete userStates[userId];
    }
  } else if (state.action === 'shop_order') {
    if (state.step === 'game_id') {
      state.gameId = msg.text;
      state.step = 'payment';
      bot.sendMessage(chatId, config.PAYMENT_INFO + '\n\n📸 Надішліть скріншот оплати:');
    } else if (state.step === 'payment') {
      if (!msg.photo) {
        bot.sendMessage(chatId, '❌ Будь ласка, надішліть скріншот квитанції');
        return;
      }
      
      const photo = msg.photo[msg.photo.length - 1].file_id;
      
      const result = await db.runAsync(`
        INSERT INTO shop_orders (user_id, product_type, amount, price, game_id, payment_screenshot, status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending')
      `, [userId, state.productType, state.amount, state.price, state.gameId, photo]);
      
      bot.sendMessage(chatId, '✅ Замовлення відправлено!\n\nОчікуйте підтвердження від адміністратора.', getMainMenu());
      
      await notifyAdminNewShopOrder(result.lastID);
      
      delete userStates[userId];
    }
  } else if (state.action === 'broadcast') {
    const message = msg.text;
    const users = await db.allAsync('SELECT id FROM users');
    
    let successCount = 0;
    let failCount = 0;
    
    for (const user of users) {
      try {
        await bot.sendMessage(user.id, message);
        successCount++;
        await new Promise(resolve => setTimeout(resolve, 50)); // Затримка між повідомленнями
      } catch (error) {
        failCount++;
      }
    }
    
    bot.sendMessage(chatId, `📨 Розсилка завершена!\n\n✅ Успішно: ${successCount}\n❌ Помилок: ${failCount}`, getAdminMenu());
    delete userStates[userId];
  } else if (state.action === 'add_channel') {
    const channelInfo = msg.text;
    
    try {
      const chat = await bot.getChat(channelInfo);
      
      await db.runAsync(`
        INSERT OR IGNORE INTO required_channels (channel_id, channel_name)
        VALUES (?, ?)
      `, [channelInfo, chat.title || channelInfo]);
      
      bot.sendMessage(chatId, `✅ Канал "${chat.title || channelInfo}" додано до обов'язкових!`, getAdminMenu());
    } catch (error) {
      bot.sendMessage(chatId, '❌ Помилка! Перевірте правильність ID або username каналу.\n\nПриклад: @channelname або -100123456789', getAdminMenu());
    }
    
    delete userStates[userId];
  }
}

// Преміум послуги
function showPremiumServices(chatId) {
  const buttons = Object.entries(config.PREMIUM_SERVICES).map(([key, value]) => [{
    text: `${value.name} - ${value.price} грн`,
    callback_data: `premium_${key}`
  }]);
  
  bot.sendMessage(chatId, '💎 Преміум-послуги:', {
    reply_markup: {
      inline_keyboard: [...buttons, [{ text: '❌ Скасувати', callback_data: 'cancel' }]]
    }
  });
}

// Підтвердження премиум-послуги після вибору оголошення
async function confirmPremiumService(userId, chatId, service, announcementId) {
  const serviceInfo = config.PREMIUM_SERVICES[service];
  
  userStates[userId] = {
    action: 'premium_service',
    service: service,
    announcementId: announcementId,
    step: 'payment'
  };
  
  bot.sendMessage(chatId, `💎 ${serviceInfo.name}\n💰 Ціна: ${serviceInfo.price} грн\n\n${config.PAYMENT_INFO}\n\n📸 Надішліть скріншот оплати:`);
}

async function startPremiumService(userId, chatId, service) {
  const serviceInfo = config.PREMIUM_SERVICES[service];
  
  if (service.startsWith('pin_')) {
    // Для закріпу - показуємо список оголошень
    const pinnedCount = await db.getAsync(`
      SELECT COUNT(*) as count FROM pinned_posts
      WHERE datetime(expires_at) > datetime('now')
    `);
    
    if (pinnedCount && pinnedCount.count >= config.MAX_PINNED_POSTS) {
      const nextFree = await db.getAsync(`
        SELECT datetime(expires_at) as expires FROM pinned_posts
        WHERE datetime(expires_at) > datetime('now')
        ORDER BY expires_at ASC LIMIT 1
      `);
      
      bot.sendMessage(chatId, `⚠️ Зайнято!\n\nВсі місця для закріпу зайняті.\n\n🕐 Наступне місце звільниться: ${nextFree.expires}`);
      return;
    }
    
    // Для закріпу отримуємо список оголошень
    const announcements = await db.allAsync(`
      SELECT id, category, text, created_at
      FROM announcements
      WHERE user_id = ? AND status = 'approved'
      ORDER BY created_at DESC
      LIMIT 10
    `, [userId]);
    
    if (announcements.length === 0) {
      bot.sendMessage(chatId, '❌ У вас немає одобрених оголошень!\n\nСпочатку створіть оголошення і дочекайтесь його підтвердження адміністратором.', getMainMenu());
      return;
    }
    
    // Показуємо список оголошень для вибору
    const buttons = announcements.map(ann => {
      const categoryName = getCategoryName(ann.category);
      const shortText = ann.text ? ann.text.substring(0, 30) + (ann.text.length > 30 ? '...' : '') : 'Без тексту';
      return [{
        text: `${categoryName}: ${shortText}`,
        callback_data: `premium_select_${service}_${ann.id}`
      }];
    });
    
    bot.sendMessage(chatId, `💎 ${serviceInfo.name}\n💰 Ціна: ${serviceInfo.price} грн\n\n📢 Оберіть оголошення для якого потрібна ця послуга:`, {
      reply_markup: {
        inline_keyboard: [...buttons, [{ text: '❌ Скасувати', callback_data: 'cancel' }]]
      }
    });
  } else {
    // Для автопосту - одразу оплата, потім створення оголошення
    userStates[userId] = {
      action: 'premium_service',
      service: service,
      step: 'payment'
    };
    
    bot.sendMessage(chatId, `💎 ${serviceInfo.name}\n💰 Ціна: ${serviceInfo.price} грн\n\n${config.PAYMENT_INFO}\n\n📸 Надішліть скріншот оплати:`);
  }
}

// Меню магазину
function showShopMenu(chatId) {
  bot.sendMessage(chatId, '🛒 Магазин:\n\nОберіть що ви хочете придбати:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🎮 UC (PUBG Mobile)', callback_data: 'shop_uc' }],
        [{ text: '⭐ Telegram Stars', callback_data: 'shop_stars' }],
        [{ text: '🔙 Головне меню', callback_data: 'cancel' }]
      ]
    }
  });
}

// Магазин UC
function showUCShop(chatId) {
  const buttons = config.UC_PACKAGES.map((pkg, index) => [{
    text: `${pkg.amount} UC - ${pkg.price} грн`,
    callback_data: `uc_${index}`
  }]);
  
  bot.sendMessage(chatId, '🛒 Магазин UC:', {
    reply_markup: {
      inline_keyboard: [...buttons, [{ text: '🔙 Назад', callback_data: 'shop_back' }]]
    }
  });
}

function startUCOrder(userId, chatId, index) {
  const pkg = config.UC_PACKAGES[index];
  
  userStates[userId] = {
    action: 'shop_order',
    productType: 'uc',
    amount: pkg.amount,
    price: pkg.price,
    step: 'game_id'
  };
  
  bot.sendMessage(chatId, `🎮 Замовлення: ${pkg.amount} UC за ${pkg.price} грн\n\n📝 Введіть ваш ігровий ID або нік:`);
}

// Магазин Stars
function showStarsShop(chatId) {
  const buttons = config.STARS_PACKAGES.map((pkg, index) => [{
    text: `⭐ ${pkg.amount} - ${pkg.price} грн`,
    callback_data: `stars_${index}`
  }]);
  
  bot.sendMessage(chatId, '⭐ Магазин Telegram Stars:', {
    reply_markup: {
      inline_keyboard: [...buttons, [{ text: '🔙 Назад', callback_data: 'shop_back' }]]
    }
  });
}

// Офіційні канали
function showOfficialChannels(chatId) {
  const message = '📺 Наші офіційні канали:\n\n' +
    '🔹 https://t.me/HeartUA_official\n' +
    '🔹 https://t.me/HeartUkrainePUBG\n\n' +
    '📢 Приєднуйтесь до нашої спільноти!';
  
  bot.sendMessage(chatId, message, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📢 HeartUA Official', url: 'https://t.me/HeartUA_official' }],
        [{ text: '🎮 Heart of Ukraine PUBG', url: 'https://t.me/HeartUkrainePUBG' }]
      ]
    }
  });
}

function startStarsOrder(userId, chatId, index) {
  const pkg = config.STARS_PACKAGES[index];
  
  userStates[userId] = {
    action: 'shop_order',
    productType: 'stars',
    amount: pkg.amount,
    price: pkg.price,
    step: 'game_id'
  };
  
  bot.sendMessage(chatId, `⭐ Замовлення: ${pkg.amount} Stars за ${pkg.price} грн\n\n📝 Введіть ваш ігровий ID або нік:`);
}

// Допомога
function showHelp(chatId) {
  let message = '❓ Довідка по боту:\n\n';
  message += '📢 Оголошення - створення оголошень\n';
  message += '💎 Преміум-послуги - автопост та закріп\n';
  message += '🛒 Магазин - покупка UC та Stars\n';
  message += '👨‍💼 Адміни - контакти адміністрації\n\n';
  message += '💬 З питань звертайтесь до адміністраторів!';
  
  bot.sendMessage(chatId, message);
}

// Адміни
function showAdmins(chatId) {
  let message = '👨‍💼 Адміністрація:\n\n';
  
  if (config.ADMIN_IDS && Array.isArray(config.ADMIN_IDS)) {
    config.ADMIN_IDS.forEach((adminId, index) => {
      message += `🔹 Адмін ${index + 1}: ${adminId}\n`;
    });
  } else {
    message += `🔹 ID: ${config.ADMIN_ID}\n`;
  }
  
  message += '\n💬 З питань звертайтесь до адміністраторів!';
  
  bot.sendMessage(chatId, message);
}

// Модерація
async function showModeration(chatId) {
  const announcements = await db.allAsync(`
    SELECT a.*, u.username, u.first_name
    FROM announcements a
    LEFT JOIN users u ON a.user_id = u.id
    WHERE a.status = 'pending'
    ORDER BY a.created_at DESC
    LIMIT 10
  `);
  
  const premiumServices = await db.allAsync(`
    SELECT ps.*, u.username, u.first_name
    FROM premium_services ps
    LEFT JOIN users u ON ps.user_id = u.id
    WHERE ps.status = 'pending'
    ORDER BY ps.created_at DESC
    LIMIT 5
  `);
  
  const shopOrders = await db.allAsync(`
    SELECT so.*, u.username, u.first_name
    FROM shop_orders so
    LEFT JOIN users u ON so.user_id = u.id
    WHERE so.status = 'pending'
    ORDER BY so.created_at DESC
    LIMIT 5
  `);
  
  if (announcements.length === 0 && premiumServices.length === 0 && shopOrders.length === 0) {
    bot.sendMessage(chatId, '✅ Немає заявок на модерацію!', getAdminMenu());
    return;
  }
  
  bot.sendMessage(chatId, `📋 Заявок на модерацію:\n\n📢 Оголошення: ${announcements.length}\n💎 Преміум: ${premiumServices.length}\n🛒 Магазин: ${shopOrders.length}`);
  
  // Показ оголошень
  for (const ann of announcements) {
    const username = ann.username ? `@${ann.username}` : ann.first_name;
    const category = getCategoryName(ann.category);
    
    const buttons = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Підтвердити', callback_data: `approve_ann_${ann.id}` },
            { text: '❌ Відхилити', callback_data: `reject_ann_${ann.id}` }
          ]
        ]
      }
    };
    
    if (ann.photo) {
      await bot.sendPhoto(chatId, ann.photo, {
        caption: `📢 Оголошення #${ann.id}\n👤 Від: ${username}\n📁 Категорія: ${category}\n\n${ann.text || ''}`,
        ...buttons
      });
    } else {
      await bot.sendMessage(chatId, `📢 Оголошення #${ann.id}\n👤 Від: ${username}\n📁 Категорія: ${category}\n\n${ann.text}`, buttons);
    }
  }
  
  // Показ преміум-послуг
  for (const service of premiumServices) {
    const username = service.username ? `@${service.username}` : service.first_name;
    const serviceInfo = config.PREMIUM_SERVICES[service.service_type];
    
    const buttons = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Підтвердити', callback_data: `approve_premium_${service.id}` },
            { text: '❌ Відхилити', callback_data: `reject_premium_${service.id}` }
          ]
        ]
      }
    };
    
    await bot.sendPhoto(chatId, service.payment_screenshot, {
      caption: `💎 Преміум-послуга #${service.id}\n👤 Від: ${username}\n📋 Послуга: ${serviceInfo.name}\n💰 Ціна: ${serviceInfo.price} грн`,
      ...buttons
    });
  }
  
  // Показ замовлень магазину
  for (const order of shopOrders) {
    const username = order.username ? `@${order.username}` : order.first_name;
    const productName = order.product_type === 'uc' ? 'UC' : 'Stars';
    
    const buttons = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Підтвердити', callback_data: `approve_shop_${order.id}` },
            { text: '❌ Відхилити', callback_data: `reject_shop_${order.id}` }
          ]
        ]
      }
    };
    
    await bot.sendPhoto(chatId, order.payment_screenshot, {
      caption: `🛒 Замовлення #${order.id}\n👤 Від: ${username}\n📦 Товар: ${order.amount} ${productName}\n💰 Ціна: ${order.price} грн\n🎮 ID/Нік: ${order.game_id}`,
      ...buttons
    });
  }
}

// Підтвердження оголошення
async function approveAnnouncement(chatId, annId) {
  const ann = await db.getAsync('SELECT * FROM announcements WHERE id = ?', [annId]);
  
  if (!ann) {
    bot.sendMessage(chatId, '❌ Оголошення не знайдено!');
    return;
  }
  
  await db.runAsync(`
    UPDATE announcements
    SET status = 'approved', published_at = datetime('now')
    WHERE id = ?
  `, [annId]);
  
  const categoryName = getCategoryName(ann.category);
  const topicId = getCategoryTopicId(ann.category);
  
  // Канал для публікації (канал або чат з адміном)
  const publishChannel = config.ANNOUNCEMENTS_CHANNEL || chatId;
  
  // Публікація
  try {
    const options = {};
    
    // Якщо є topic ID, додаємо його (для супергруп з темами)
    if (topicId) {
      options.message_thread_id = topicId;
    }
    
    if (ann.photo) {
      await bot.sendPhoto(publishChannel, ann.photo, {
        caption: `${categoryName}\n\n${ann.text || ''}`,
        ...options
      });
    } else {
      await bot.sendMessage(publishChannel, `${categoryName}\n\n${ann.text}`, options);
    }
    
    // Повідомлення користувачу
    const channelLink = config.ANNOUNCEMENTS_CHANNEL 
      ? (config.ANNOUNCEMENTS_CHANNEL.startsWith('@') 
        ? `https://t.me/${config.ANNOUNCEMENTS_CHANNEL.slice(1)}` 
        : 'в канал')
      : 'адміністратору';
    
    bot.sendMessage(ann.user_id, `✅ Ваше оголошення опубліковано!\n\n📢 Перегляньте: ${channelLink}`);
    bot.sendMessage(chatId, `✅ Оголошення #${annId} опубліковано в канал!`);
  } catch (error) {
    bot.sendMessage(chatId, '❌ Помилка публікації: ' + error.message);
    console.error('Помилка публікації оголошення:', error);
  }
}

// Відхилення оголошення
async function rejectAnnouncement(chatId, annId) {
  const ann = await db.getAsync('SELECT * FROM announcements WHERE id = ?', [annId]);
  
  if (!ann) {
    bot.sendMessage(chatId, '❌ Оголошення не знайдено!');
    return;
  }
  
  await db.runAsync('UPDATE announcements SET status = ? WHERE id = ?', ['rejected', annId]);
  
  bot.sendMessage(ann.user_id, '❌ Ваше оголошення відхилено адміністратором.');
  bot.sendMessage(chatId, `✅ Оголошення #${annId} відхилено!`);
}

// Підтвердження преміум-послуги
async function approvePremiumService(chatId, serviceId) {
  const service = await db.getAsync('SELECT * FROM premium_services WHERE id = ?', [serviceId]);
  
  if (!service) {
    bot.sendMessage(chatId, '❌ Послугу не знайдено!');
    return;
  }
  
  const serviceInfo = config.PREMIUM_SERVICES[service.service_type];
  const expiresAt = new Date(Date.now() + serviceInfo.duration * 60 * 60 * 1000).toISOString();
  
  await db.runAsync(`
    UPDATE premium_services
    SET status = 'approved', approved_at = datetime('now'), expires_at = ?
    WHERE id = ?
  `, [expiresAt, serviceId]);
  
  // Якщо це закріп - додаємо в pinned_posts
  if (service.service_type.startsWith('pin_')) {
    await db.runAsync(`
      INSERT INTO pinned_posts (announcement_id, user_id, expires_at)
      VALUES (?, ?, ?)
    `, [service.announcement_id || null, service.user_id, expiresAt]);
    
    bot.sendMessage(service.user_id, '✅ Вашу преміум-послугу активовано!');
  }
  
  // Якщо це автопост - пропонуємо створити оголошення
  if (service.service_type.startsWith('autopost_')) {
    // Додаємо задачу автопосту (спочатку без announcement_id)
    await db.runAsync(`
      INSERT INTO autopost_tasks (announcement_id, user_id, duration, expires_at, status)
      VALUES (?, ?, ?, ?, 'pending')
    `, [null, service.user_id, serviceInfo.duration, expiresAt]);
    
    // Пропонуємо користувачу створити оголошення
    userStates[service.user_id] = {
      action: 'premium_service',
      service: service.service_type,
      premiumServiceId: serviceId,
      step: 'select_category'
    };
    
    bot.sendMessage(service.user_id, `✅ Послугу "${serviceInfo.name}" активовано!\n\n📢 Тепер оберіть категорію та напишіть текст оголошення, яке буде публікуватись кожну годину:`, getCategoriesMenu());
  }
  
  bot.sendMessage(chatId, `✅ Преміум-послугу #${serviceId} активовано!`);
}

// Відхилення преміум-послуги
async function rejectPremiumService(chatId, serviceId) {
  const service = await db.getAsync('SELECT * FROM premium_services WHERE id = ?', [serviceId]);
  
  if (!service) {
    bot.sendMessage(chatId, '❌ Послугу не знайдено!');
    return;
  }
  
  await db.runAsync('UPDATE premium_services SET status = ? WHERE id = ?', ['rejected', serviceId]);
  
  bot.sendMessage(service.user_id, '❌ Вашу заявку на преміум-послугу відхилено.');
  bot.sendMessage(chatId, `✅ Преміум-послугу #${serviceId} відхилено!`);
}

// Підтвердження замовлення в магазині
async function approveShopOrder(chatId, orderId) {
  const order = await db.getAsync('SELECT * FROM shop_orders WHERE id = ?', [orderId]);
  
  if (!order) {
    bot.sendMessage(chatId, '❌ Замовлення не знайдено!');
    return;
  }
  
  await db.runAsync(`
    UPDATE shop_orders
    SET status = 'completed', completed_at = datetime('now')
    WHERE id = ?
  `, [orderId]);
  
  bot.sendMessage(order.user_id, '✅ Послугу виконано!\n\nВаше замовлення оброблено.');
  bot.sendMessage(chatId, `✅ Замовлення #${orderId} виконано!`);
}

// Відхилення замовлення в магазині
async function rejectShopOrder(chatId, orderId) {
  const order = await db.getAsync('SELECT * FROM shop_orders WHERE id = ?', [orderId]);
  
  if (!order) {
    bot.sendMessage(chatId, '❌ Замовлення не знайдено!');
    return;
  }
  
  await db.runAsync('UPDATE shop_orders SET status = ? WHERE id = ?', ['rejected', orderId]);
  
  bot.sendMessage(order.user_id, '❌ Ваше замовлення відхилено.');
  bot.sendMessage(chatId, `✅ Замовлення #${orderId} відхилено!`);
}

// Керування каналами
async function showChannelsManagement(chatId) {
  const channels = await db.allAsync('SELECT * FROM required_channels');
  
  if (channels.length === 0) {
    bot.sendMessage(chatId, '📺 Обов\'язкових каналів немає.\n\nДодайте канал:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Додати канал', callback_data: 'add_channel' }],
          [{ text: '🔙 Назад', callback_data: 'cancel' }]
        ]
      }
    });
    return;
  }
  
  let message = '📺 Обов\'язкові канали:\n\n';
  const buttons = [];
  
  channels.forEach(ch => {
    message += `• ${ch.channel_name} (${ch.channel_id})\n`;
    buttons.push([{ text: `🗑️ ${ch.channel_name}`, callback_data: `remove_channel_${ch.channel_id}` }]);
  });
  
  buttons.push([{ text: '➕ Додати канал', callback_data: 'add_channel' }]);
  buttons.push([{ text: '🔙 Назад', callback_data: 'cancel' }]);
  
  bot.sendMessage(chatId, message, {
    reply_markup: {
      inline_keyboard: buttons
    }
  });
}

function startAddChannel(userId, chatId) {
  userStates[userId] = {
    action: 'add_channel'
  };
  
  bot.sendMessage(chatId, '📺 Надішліть ID або username каналу:\n\nПриклад: @channelname або -100123456789');
}

async function removeChannel(chatId, channelId) {
  await db.runAsync('DELETE FROM required_channels WHERE channel_id = ?', [channelId]);
  
  bot.sendMessage(chatId, '✅ Канал видалено!');
  await showChannelsManagement(chatId);
}

// Список користувачів
async function showUsers(chatId) {
  const users = await db.allAsync('SELECT * FROM users ORDER BY joined_at DESC LIMIT 20');
  
  let message = '👥 Користувачі (останні 20):\n\n';
  
  users.forEach((user, index) => {
    const username = user.username ? `@${user.username}` : user.first_name;
    message += `${index + 1}. ${username} (ID: ${user.id})\n`;
  });
  
  const totalUsers = await db.getAsync('SELECT COUNT(*) as count FROM users');
  message += `\n📊 Всього користувачів: ${totalUsers.count}`;
  
  bot.sendMessage(chatId, message, getAdminMenu());
}

// Закріпи
async function showPinnedPosts(chatId) {
  const pinned = await db.allAsync(`
    SELECT pp.*, u.username, u.first_name
    FROM pinned_posts pp
    LEFT JOIN users u ON pp.user_id = u.id
    WHERE datetime(pp.expires_at) > datetime('now')
    ORDER BY pp.created_at DESC
  `);
  
  if (pinned.length === 0) {
    bot.sendMessage(chatId, '📌 Немає активних закріпів.\n\n' + 
      `Доступно місць: ${config.MAX_PINNED_POSTS}/${config.MAX_PINNED_POSTS}`, getAdminMenu());
    return;
  }
  
  let message = `📌 Активні закріпи (${pinned.length}/${config.MAX_PINNED_POSTS}):\n\n`;
  
  pinned.forEach((pin, index) => {
    const username = pin.username ? `@${pin.username}` : pin.first_name;
    const expiresAt = new Date(pin.expires_at);
    message += `${index + 1}. ${username}\n`;
    message += `   Закінчується: ${expiresAt.toLocaleString('uk-UA')}\n\n`;
  });
  
  bot.sendMessage(chatId, message, getAdminMenu());
}

// Розсилка
function startBroadcast(chatId, userId) {
  userStates[userId] = {
    action: 'broadcast'
  };
  
  bot.sendMessage(chatId, '📨 Напишіть повідомлення для розсилки усім користувачам:');
}

// Повідомлення адміну про нове оголошення
async function notifyAdminNewAnnouncement(annId) {
  const ann = await db.getAsync(`
    SELECT a.*, u.username, u.first_name
    FROM announcements a
    LEFT JOIN users u ON a.user_id = u.id
    WHERE a.id = ?
  `, [annId]);
  
  if (!ann) return;
  
  const username = ann.username ? `@${ann.username}` : ann.first_name;
  const category = getCategoryName(ann.category);
  
  const buttons = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Підтвердити', callback_data: `approve_ann_${ann.id}` },
          { text: '❌ Відхилити', callback_data: `reject_ann_${ann.id}` }
        ]
      ]
    }
  };
  
  const message = `🔔 Нове оголошення #${ann.id}\n👤 Від: ${username}\n📁 Категорія: ${category}\n\n${ann.text || ''}`;
  
  if (ann.photo) {
    await sendToAllAdmins(message, { photo: ann.photo, ...buttons });
  } else {
    await sendToAllAdmins(message, buttons);
  }
}

// Повідомлення адміну про нову преміум-послугу
async function notifyAdminNewPremiumService(serviceId) {
  const service = await db.getAsync(`
    SELECT ps.*, u.username, u.first_name, a.text as ann_text, a.category
    FROM premium_services ps
    LEFT JOIN users u ON ps.user_id = u.id
    LEFT JOIN announcements a ON ps.announcement_id = a.id
    WHERE ps.id = ?
  `, [serviceId]);
  
  if (!service) return;
  
  const username = service.username ? `@${service.username}` : service.first_name;
  const serviceInfo = config.PREMIUM_SERVICES[service.service_type];
  
  const buttons = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Підтвердити', callback_data: `approve_premium_${service.id}` },
          { text: '❌ Відхилити', callback_data: `reject_premium_${service.id}` }
        ]
      ]
    }
  };
  
  let message = `🔔 Нова преміум-послуга #${service.id}\n👤 Від: ${username}\n📋 Послуга: ${serviceInfo.name}\n💰 Ціна: ${serviceInfo.price} грн`;
  
  // Додаємо інфо про оголошення
  if (service.announcement_id && service.ann_text) {
    const categoryName = getCategoryName(service.category);
    const shortText = service.ann_text.substring(0, 50) + (service.ann_text.length > 50 ? '...' : '');
    message += `\n\n📢 Оголошення:\n${categoryName}: ${shortText}`;
  }
  
  await sendToAllAdmins(message, { photo: service.payment_screenshot, ...buttons });
}

// Повідомлення адміну про нове замовлення
async function notifyAdminNewShopOrder(orderId) {
  const order = await db.getAsync(`
    SELECT so.*, u.username, u.first_name
    FROM shop_orders so
    LEFT JOIN users u ON so.user_id = u.id
    WHERE so.id = ?
  `, [orderId]);
  
  if (!order) return;
  
  const username = order.username ? `@${order.username}` : order.first_name;
  const productName = order.product_type === 'uc' ? 'UC' : 'Stars';
  
  const buttons = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Підтвердити', callback_data: `approve_shop_${order.id}` },
          { text: '❌ Відхилити', callback_data: `reject_shop_${order.id}` }
        ]
      ]
    }
  };
  
  const message = `🔔 Нове замовлення #${order.id}\n👤 Від: ${username}\n📦 Товар: ${order.amount} ${productName}\n💰 Ціна: ${order.price} грн\n🎮 ID/Нік: ${order.game_id}`;
  await sendToAllAdmins(message, { photo: order.payment_screenshot, ...buttons });
}

// Cron задачі
// Автопости (кожну годину)
cron.schedule('0 * * * *', async () => {
  const tasks = await db.allAsync(`
    SELECT at.*, a.text, a.photo, a.category
    FROM autopost_tasks at
    LEFT JOIN announcements a ON at.announcement_id = a.id
    WHERE at.status = 'active' AND datetime(at.expires_at) > datetime('now')
  `);
  
  for (const task of tasks) {
    try {
      const category = getCategoryName(task.category);
      const topicId = getCategoryTopicId(task.category);
      const publishChannel = config.ANNOUNCEMENTS_CHANNEL || config.ADMIN_ID;
      
      const options = {};
      if (topicId) options.message_thread_id = topicId;
      
      if (task.photo) {
        await bot.sendPhoto(publishChannel, task.photo, {
          caption: `🔄 Автопост\n${category}\n\n${task.text || ''}`,
          ...options
        });
      } else {
        await bot.sendMessage(publishChannel, `🔄 Автопост\n${category}\n\n${task.text}`, options);
      }
      
      // Оновлюємо last_posted
      await db.runAsync('UPDATE autopost_tasks SET last_posted = datetime(?) WHERE id = ?', ['now', task.id]);
    } catch (error) {
      console.error(`Помилка автопосту #${task.id}:`, error.message);
    }
  }
});

// Очищення закінчених закріпів
cron.schedule('*/30 * * * *', async () => {
  await db.runAsync(`
    UPDATE pinned_posts
    SET status = 'expired'
    WHERE datetime(expires_at) <= datetime('now') AND status != 'expired'
  `);
});

// Очищення закінчених автопостів та відправка уведомлень
cron.schedule('*/5 * * * *', async () => {
  // Знаходимо автопости що закінчуються через 1 годину
  const endingSoon = await db.allAsync(`
    SELECT at.*, ps.user_id
    FROM autopost_tasks at
    LEFT JOIN premium_services ps ON ps.announcement_id = at.announcement_id
    WHERE at.status = 'active' 
    AND datetime(at.expires_at) BETWEEN datetime('now', '+55 minutes') AND datetime('now', '+65 minutes')
    AND (at.notified_ending IS NULL OR at.notified_ending = 0)
  `);
  
  for (const task of endingSoon) {
    if (!task.user_id) continue;
    try {
      await bot.sendMessage(task.user_id, '⏰ Ваш автопост закінчується через 1 годину!\n\nЯкщо хочете продовжити, замовте нову послугу.');
      await db.runAsync('UPDATE autopost_tasks SET notified_ending = 1 WHERE id = ?', [task.id]);
    } catch (error) {
      console.error(`Помилка надсилання уведомлення ${task.user_id}:`, error.message);
    }
  }
  
  // Знаходимо автопости що публікуються востаннє (за 5 хвилин)
  const lastPost = await db.allAsync(`
    SELECT at.*, ps.user_id
    FROM autopost_tasks at
    LEFT JOIN premium_services ps ON ps.announcement_id = at.announcement_id
    WHERE at.status = 'active'
    AND datetime(at.expires_at) BETWEEN datetime('now', '+5 minutes') AND datetime('now', '+10 minutes')
    AND (at.notified_last IS NULL OR at.notified_last = 0)
  `);
  
  for (const task of lastPost) {
    if (!task.user_id) continue;
    try {
      await bot.sendMessage(task.user_id, '⏰ Через 5 хвилин буде остання публікація вашого автопосту!');
      await db.runAsync('UPDATE autopost_tasks SET notified_last = 1 WHERE id = ?', [task.id]);
    } catch (error) {
      console.error(`Помилка надсилання уведомлення ${task.user_id}:`, error.message);
    }
  }
  
  // Знаходимо завершені автопости
  const completed = await db.allAsync(`
    SELECT at.*, ps.user_id
    FROM autopost_tasks at
    LEFT JOIN premium_services ps ON ps.announcement_id = at.announcement_id
    WHERE at.status = 'active'
    AND datetime(at.expires_at) <= datetime('now')
  `);
  
  for (const task of completed) {
    if (!task.user_id) continue;
    try {
      const serviceInfo = config.PREMIUM_SERVICES[`autopost_${task.duration}`];
      await bot.sendMessage(task.user_id, `✅ Ваш автопост "${serviceInfo ? serviceInfo.name : task.duration + ' годин'}" завершено!\n\n📊 Всього публікацій: ${task.duration}\n\nДякуємо за використання!`);
    } catch (error) {
      console.error(`Помилка надсилання уведомлення ${task.user_id}:`, error.message);
    }
  }
  
  // Очищення закінчених автопостів
  await db.runAsync(`
    UPDATE autopost_tasks
    SET status = 'expired'
    WHERE datetime(expires_at) <= datetime('now') AND status = 'active'
  `);
});

// Обробка помилок бота
bot.on('polling_error', (error) => {
  console.error('Помилка polling:', error.message);
});

bot.on('error', (error) => {
  console.error('Помилка бота:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

console.log('🤖 HeartUA Bot запущено!');
if (config.ADMIN_IDS && Array.isArray(config.ADMIN_IDS)) {
  console.log(`👥 Адміністратори: ${config.ADMIN_IDS.join(', ')}`);
} else {
  console.log(`👤 Адмін ID: ${config.ADMIN_ID}`);
}


