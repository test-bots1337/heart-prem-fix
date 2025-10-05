const { TelegramApi } = require('gramjs');
const { StringSession } = require('gramjs/sessions');
const { Api } = require('gramjs/tl');
const { NewMessage } = require('gramjs/events');
const { NewMessageEvent } = require('gramjs/events/NewMessage');
const config = require('./config');

class TelegramClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.sessionString = null;
  }

  async initialize() {
    try {
      // Create a new session string if none exists
      if (!this.sessionString) {
        this.sessionString = new StringSession('');
      }

      this.client = new TelegramApi(
        this.sessionString,
        config.API_ID,
        config.API_HASH,
        {
          connectionRetries: 5,
          timeout: 10000,
        }
      );

      await this.client.start({
        phoneNumber: config.PHONE_NUMBER,
        password: async () => {
          if (config.TWO_FA_PASSWORD) {
            return config.TWO_FA_PASSWORD;
          }
          throw new Error('Two-factor authentication password required');
        },
        phoneCode: async () => {
          if (config.PHONE_CODE) {
            return config.PHONE_CODE;
          }
          throw new Error('Phone code required');
        },
        onError: (err) => {
          console.error('Telegram client error:', err);
        },
      });

      this.isConnected = true;
      console.log('✅ Telegram client connected successfully');
      
      // Save session string for future use
      this.sessionString = this.client.session.save();
      console.log('📱 Session string:', this.sessionString);
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Telegram client:', error);
      return false;
    }
  }

  async sendMessage(chatId, message, options = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Client not connected');
      }

      const chat = await this.client.getEntity(chatId);
      
      // Prepare message options
      const messageOptions = {
        parseMode: 'html', // Use HTML parsing to preserve formatting
        ...options
      };

      // If there's a message thread ID (for topics), add it
      if (options.message_thread_id) {
        messageOptions.replyTo = options.message_thread_id;
      }

      // Send the message
      const result = await this.client.sendMessage(chat, {
        message: message,
        ...messageOptions
      });

      return result;
    } catch (error) {
      console.error('❌ Failed to send message:', error);
      throw error;
    }
  }

  async sendPhoto(chatId, photo, options = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Client not connected');
      }

      const chat = await this.client.getEntity(chatId);
      
      // Prepare message options
      const messageOptions = {
        parseMode: 'html', // Use HTML parsing to preserve formatting
        ...options
      };

      // If there's a message thread ID (for topics), add it
      if (options.message_thread_id) {
        messageOptions.replyTo = options.message_thread_id;
      }

      // Send the photo with caption
      const result = await this.client.sendFile(chat, {
        file: photo,
        caption: options.caption || '',
        ...messageOptions
      });

      return result;
    } catch (error) {
      console.error('❌ Failed to send photo:', error);
      throw error;
    }
  }

  async forwardMessage(chatId, fromChatId, messageId, options = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Client not connected');
      }

      const chat = await this.client.getEntity(chatId);
      const fromChat = await this.client.getEntity(fromChatId);
      
      // Prepare forward options
      const forwardOptions = {
        ...options
      };

      // If there's a message thread ID (for topics), add it
      if (options.message_thread_id) {
        forwardOptions.replyTo = options.message_thread_id;
      }

      // Forward the message
      const result = await this.client.forwardMessages(chat, {
        messages: [messageId],
        fromPeer: fromChat,
        ...forwardOptions
      });

      return result;
    } catch (error) {
      console.error('❌ Failed to forward message:', error);
      throw error;
    }
  }

  async getChatMember(chatId, userId) {
    try {
      if (!this.isConnected) {
        throw new Error('Client not connected');
      }

      const chat = await this.client.getEntity(chatId);
      const user = await this.client.getEntity(userId);
      
      const result = await this.client.invoke(
        new Api.channels.GetParticipant({
          channel: chat,
          participant: user
        })
      );

      return {
        status: result.participant.className.replace('ChannelParticipant', '').toLowerCase()
      };
    } catch (error) {
      console.error('❌ Failed to get chat member:', error);
      return { status: 'left' };
    }
  }

  async getChat(chatId) {
    try {
      if (!this.isConnected) {
        throw new Error('Client not connected');
      }

      const chat = await this.client.getEntity(chatId);
      return {
        id: chat.id.toString(),
        title: chat.title || chat.firstName || chat.username,
        type: chat.className
      };
    } catch (error) {
      console.error('❌ Failed to get chat:', error);
      throw error;
    }
  }

  async setupEventHandlers(messageHandler) {
    if (!this.isConnected) {
      throw new Error('Client not connected');
    }

    // Handle new messages
    this.client.addEventHandler(messageHandler, new NewMessage({}));
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
      console.log('📱 Telegram client disconnected');
    }
  }

  // Method to preserve premium emojis and hyperlinks in message text
  preserveFormatting(text) {
    if (!text) return text;
    
    // The GramJS client should automatically preserve premium emojis and hyperlinks
    // when using HTML parse mode, but we can add additional processing if needed
    return text;
  }

  // Method to extract premium emoji IDs from message
  extractPremiumEmojis(message) {
    const emojis = [];
    if (message.entities) {
      for (const entity of message.entities) {
        if (entity.className === 'MessageEntityCustomEmoji') {
          emojis.push({
            id: entity.documentId.toString(),
            offset: entity.offset,
            length: entity.length
          });
        }
      }
    }
    return emojis;
  }

  // Method to extract hyperlinks from message
  extractHyperlinks(message) {
    const links = [];
    if (message.entities) {
      for (const entity of message.entities) {
        if (entity.className === 'MessageEntityTextUrl') {
          links.push({
            url: entity.url,
            offset: entity.offset,
            length: entity.length
          });
        } else if (entity.className === 'MessageEntityUrl') {
          const url = message.message.substring(entity.offset, entity.offset + entity.length);
          links.push({
            url: url,
            offset: entity.offset,
            length: entity.length
          });
        }
      }
    }
    return links;
  }
}

module.exports = TelegramClient;
