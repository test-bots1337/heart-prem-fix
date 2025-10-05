const TelegramClient = require('./telegram-client');
const cron = require('node-cron');
const db = require('./database');
const config = require('./config');


const telegramClient = new TelegramClient();


const userStates = {};


const bot = {
  sendMessage: async (chatId, message, options = {}) => {
    try {
      return await telegramClient.sendMessage(chatId, message, options);
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  },
  
  sendPhoto: async (chatId, photo, options = {}) => {
    try {
      return await telegramClient.sendPhoto(chatId, photo, options);
    } catch (error) {
      console.error('Error sending photo:', error);
      throw error;
    }
  },
  
  getChatMember: async (chatId, userId) => {
    try {
      return await telegramClient.getChatMember(chatId, userId);
    } catch (error) {
      console.error('Error getting chat member:', error);
      return { status: 'left' };
    }
  },
  
  getChat: async (chatId) => {
    try {
      return await telegramClient.getChat(chatId);
    } catch (error) {
      console.error('Error getting chat:', error);
      throw error;
    }
  }
};


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


function isAdmin(userId) {
  if (config.ADMIN_IDS && Array.isArray(config.ADMIN_IDS)) {
    return config.ADMIN_IDS.includes(userId);
  }
  return userId === config.ADMIN_ID;
}


function getCategoryName(categoryKey) {
  const category = config.CATEGORIES[categoryKey];
  return typeof category === 'string' ? category : category.name;
}


function getCategoryTopicId(categoryKey) {
  const category = config.CATEGORIES[categoryKey];
  return typeof category === 'object' ? category.topicId : null;
}


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


async function checkSubscriptions(userId) {
  try {
    const channels = await db.allAsync('SELECT channel_id FROM required_channels');
    
    if (channels.length === 0) {
      return true; 
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


async function handleMessage(event) {
  const msg = event.message;
  const chatId = msg.chatId.toString();
  const userId = msg.senderId.toString();
  const text = msg.message || '';
  
  
  if (!text && !msg.photo) return;
  
  await addUser(userId, {
    username: msg.sender?.username,
    first_name: msg.sender?.firstName,
    last_name: msg.sender?.lastName
  });
  
  
  if (text.startsWith('/start')) {
    let welcomeText = '👋 Вітаємо в HeartUA Bot!\n\n';
    welcomeText += 'Оберіть розділ з меню нижче:';
    
    if (isAdmin(userId)) {
      await bot.sendMessage(chatId, welcomeText + '\n\n🔐 Ви увійшли як адміністратор', getMainMenu());
    } else {
      await bot.sendMessage(chatId, welcomeText, getMainMenu());
    }
    return;
  }
  
  
  if (text.startsWith('/admin')) {
    if (isAdmin(userId)) {
      await bot.sendMessage(chatId, '🔐 Адмін-панель:', getAdminMenu());
    } else {
      await bot.sendMessage(chatId, '❌ У вас немає доступу до адмін-панелі');
    }
    return;
  }
  
  
  if (isAdmin(userId) && msg.replyTo && msg.replyTo.replyToMsgId) {
    await bot.sendMessage(chatId, `📌 Message Thread ID: ${msg.replyTo.replyToMsgId}\n\nВставте це значення в config.js для відповідної категорії!`);
    return;
  }
  
  
  if (userStates[userId]) {
    await handleUserState(userId, chatId, msg);
    return;
  }
  
  
  if (!text) return;
  
  switch (text) {
    case '📢 Оголошення':
      await bot.sendMessage(chatId, '📢 Оберіть категорію оголошення:', getCategoriesMenu());
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
      await bot.sendMessage(chatId, 'Головне меню:', getMainMenu());
      break;
      
    
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
}


async function createAnnouncement(userId, chatId, category, messageData) {
  const { text, photo, entities } = messageData;
  
  
  const result = await db.runAsync(`
    INSERT INTO announcements (user_id, category, text, photo, entities, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `, [userId, category, text, photo, JSON.stringify(entities || [])]);
  
  return result;
}


async function publishAnnouncement(announcement, options = {}) {
  const { text, photo, entities } = announcement;
  const categoryName = getCategoryName(announcement.category);
  const topicId = getCategoryTopicId(announcement.category);
  const publishChannel = config.ANNOUNCEMENTS_CHANNEL || options.chatId;
  
  const messageOptions = {
    parseMode: 'html',
    ...options
  };
  
  if (topicId) {
    messageOptions.message_thread_id = topicId;
  }
  
  try {
    if (photo) {
      return await bot.sendPhoto(publishChannel, photo, {
        caption: `${categoryName}\n\n${text || ''}`,
        ...messageOptions
      });
    } else {
      return await bot.sendMessage(publishChannel, `${categoryName}\n\n${text}`, messageOptions);
    }
  } catch (error) {
    console.error('Помилка публікації оголошення:', error);
    throw error;
  }
}





function startAnnouncementCreation(userId, chatId, category) {
  userStates[userId] = {
    action: 'create_announcement',
    category: category,
    step: 'text'
  };
  
  bot.sendMessage(chatId, `📝 Напишіть текст оголошення для категорії "${getCategoryName(category)}":\n\n(або надішліть фото з описом)`);
}


async function handleUserState(userId, chatId, msg) {
  const state = userStates[userId];
  
  if (state.action === 'create_announcement') {
    if (state.step === 'text') {
      const text = msg.caption || msg.message;
      const photo = msg.photo ? msg.photo : null;
      
      if (!text && !photo) {
        await bot.sendMessage(chatId, '❌ Будь ласка, надішліть текст або фото з описом');
        return;
      }
      
      
      const isSubscribed = await checkSubscriptions(userId);
      
      if (!isSubscribed) {
        const channels = await db.allAsync('SELECT channel_name, channel_id FROM required_channels');
        let message = '⚠️ Для публікації оголошення необхідно підписатися на канали:\n\n';
        channels.forEach(ch => {
          message += `📺 ${ch.channel_name}\n`;
        });
        await bot.sendMessage(chatId, message);
        delete userStates[userId];
        return;
      }
      
      
      const entities = telegramClient.extractPremiumEmojis(msg).concat(
        telegramClient.extractHyperlinks(msg)
      );
      
      
      const result = await createAnnouncement(userId, state.category, {
        text,
        photo,
        entities
      });
      
      await bot.sendMessage(chatId, '✅ Ваше оголошення відправлено на модерацію!\n\nОчікуйте підтвердження від адміністратора.', getMainMenu());
      
      
      await notifyAdminNewAnnouncement(result.lastID);
      
      delete userStates[userId];
    }
  }
  
}


async function approveAnnouncement(chatId, annId) {
  const ann = await db.getAsync('SELECT * FROM announcements WHERE id = ?', [annId]);
  
  if (!ann) {
    await bot.sendMessage(chatId, '❌ Оголошення не знайдено!');
    return;
  }
  
  await db.runAsync(`
    UPDATE announcements
    SET status = 'approved', published_at = datetime('now')
    WHERE id = ?
  `, [annId]);
  
  
  let entities = [];
  if (ann.entities) {
    try {
      entities = JSON.parse(ann.entities);
    } catch (e) {
      console.error('Error parsing entities:', e);
    }
  }
  
  try {
    await publishAnnouncement({
      ...ann,
      entities
    });
    
    const channelLink = config.ANNOUNCEMENTS_CHANNEL 
      ? (config.ANNOUNCEMENTS_CHANNEL.startsWith('@') 
        ? `https://t.me/${config.ANNOUNCEMENTS_CHANNEL.slice(1)}` 
        : 'в канал')
      : 'адміністратору';
      
    await bot.sendMessage(ann.user_id, `✅ Ваше оголошення опубліковано!\n\n📢 Перегляньте: ${channelLink}`);
    await bot.sendMessage(chatId, `✅ Оголошення #${annId} опубліковано в канал!`);
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Помилка публікації: ' + error.message);
    console.error('Помилка публікації оголошення:', error);
  }
}

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


function showHelp(chatId) {
  let message = '❓ Довідка по боту:\n\n';
  message += '📢 Оголошення - створення оголошень\n';
  message += '💎 Преміум-послуги - автопост та закріп\n';
  message += '🛒 Магазин - покупка UC та Stars\n';
  message += '👨‍💼 Адміни - контакти адміністрації\n\n';
  message += '💬 З питань звертайтесь до адміністраторів!';
  
  bot.sendMessage(chatId, message);
}


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


async function showModeration(chatId) {
  const announcements = await db.allAsync(`
    SELECT a.*, u.username, u.first_name
    FROM announcements a
    LEFT JOIN users u ON a.user_id = u.id
    WHERE a.status = 'pending'
    ORDER BY a.created_at DESC
    LIMIT 10
  `);
  
  if (announcements.length === 0) {
    await bot.sendMessage(chatId, '✅ Немає заявок на модерацію!', getAdminMenu());
    return;
  }
  
  await bot.sendMessage(chatId, `📋 Заявок на модерацію: ${announcements.length}`);
  
  
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
}


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





async function showChannelsManagement(chatId) {
  const channels = await db.allAsync('SELECT * FROM required_channels');
  
  if (channels.length === 0) {
    await bot.sendMessage(chatId, '📺 Обов\'язкових каналів немає.\n\nДодайте канал:', {
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
  
  await bot.sendMessage(chatId, message, {
    reply_markup: {
      inline_keyboard: buttons
    }
  });
}


async function showUsers(chatId) {
  const users = await db.allAsync('SELECT * FROM users ORDER BY joined_at DESC LIMIT 20');
  
  let message = '👥 Користувачі (останні 20):\n\n';
  
  users.forEach((user, index) => {
    const username = user.username ? `@${user.username}` : user.first_name;
    message += `${index + 1}. ${username} (ID: ${user.id})\n`;
  });
  
  const totalUsers = await db.getAsync('SELECT COUNT(*) as count FROM users');
  message += `\n📊 Всього користувачів: ${totalUsers.count}`;
  
  await bot.sendMessage(chatId, message, getAdminMenu());
}


async function showPinnedPosts(chatId) {
  const pinned = await db.allAsync(`
    SELECT pp.*, u.username, u.first_name
    FROM pinned_posts pp
    LEFT JOIN users u ON pp.user_id = u.id
    WHERE datetime(pp.expires_at) > datetime('now')
    ORDER BY pp.created_at DESC
  `);
  
  if (pinned.length === 0) {
    await bot.sendMessage(chatId, '📌 Немає активних закріпів.\n\n' + 
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
  
  await bot.sendMessage(chatId, message, getAdminMenu());
}


function startBroadcast(chatId, userId) {
  userStates[userId] = {
    action: 'broadcast'
  };
  
  bot.sendMessage(chatId, '📨 Напишіть повідомлення для розсилки усім користувачам:');
}


async function initializeBot() {
  try {
    console.log('🚀 Initializing HeartUA Bot with user session...');
    
    
    const connected = await telegramClient.initialize();
    if (!connected) {
      console.error('❌ Failed to connect to Telegram');
      process.exit(1);
    }
    
    
    await telegramClient.setupEventHandlers(handleMessage);
    
    console.log('🤖 HeartUA Bot запущено з підтримкою преміум емодзі та гіперпосилань!');
    if (config.ADMIN_IDS && Array.isArray(config.ADMIN_IDS)) {
      console.log(`👥 Адміністратори: ${config.ADMIN_IDS.join(', ')}`);
    } else {
      console.log(`👤 Адмін ID: ${config.ADMIN_ID}`);
    }
    
    
    setupCronJobs();
    
  } catch (error) {
    console.error('❌ Failed to initialize bot:', error);
    process.exit(1);
  }
}


function setupCronJobs() {
  
  cron.schedule('0 * * * *', async () => {
    const tasks = await db.allAsync(`
      SELECT at.*, a.text, a.photo, a.category, a.entities
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
        
        
        let entities = [];
        if (task.entities) {
          try {
            entities = JSON.parse(task.entities);
          } catch (e) {
            console.error('Error parsing entities:', e);
          }
        }
        
        if (task.photo) {
          await bot.sendPhoto(publishChannel, task.photo, {
            caption: `🔄 Автопост\n${category}\n\n${task.text || ''}`,
            ...options
          });
        } else {
          await bot.sendMessage(publishChannel, `🔄 Автопост\n${category}\n\n${task.text}`, options);
        }
        
        
        await db.runAsync('UPDATE autopost_tasks SET last_posted = datetime(?) WHERE id = ?', ['now', task.id]);
      } catch (error) {
        console.error(`Помилка автопосту #${task.id}:`, error.message);
      }
    }
  });
  
  
  cron.schedule('*/30 * * * *', async () => {
    await db.runAsync(`
      UPDATE pinned_posts
      SET status = 'expired'
      WHERE datetime(expires_at) <= datetime('now') AND status != 'expired'
    `);
  });
  
  
  cron.schedule('*/5 * * * *', async () => {
    
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
        console.error(`Помилка надсилання уведомлення ${task.user_id}:`, error);
      }
    }
    
    
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
        console.error(`Помилка надсилання уведомлення ${task.user_id}:`, error);
      }
    }
    
    
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
        console.error(`Помилка надсилання уведомлення ${task.user_id}:`, error);
      }
    }
    
    
    await db.runAsync(`
      UPDATE autopost_tasks
      SET status = 'expired'
      WHERE datetime(expires_at) <= datetime('now') AND status = 'active'
    `);
  });
}


process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down bot...');
  await telegramClient.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down bot...');
  await telegramClient.disconnect();
  process.exit(0);
});


process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});


initializeBot();
