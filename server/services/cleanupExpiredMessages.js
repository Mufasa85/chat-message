/**
 * Service de nettoyage des messages éphémères expirés
 * Supprime automatiquement les messages de la BDD MongoDB après leur expiration
 */

const Message = require("../models/Message");

class CleanupService {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
  }

  /**
   * Démarre le service de nettoyage
   * @param {number} intervalMs - Intervalle entre chaque nettoyage (ms)
   */
  start(intervalMs = 30000) {
    if (this.intervalId) {
      console.log("[CleanupService] Service déjà démarré");
      return;
    }

    console.log(
      `[CleanupService] Démarrage du service (intervalle: ${intervalMs}ms)`,
    );

    // Nettoyage initial
    this.cleanup();

    // Nettoyage périodique
    this.intervalId = setInterval(() => this.cleanup(), intervalMs);
  }

  /**
   * Arrête le service de nettoyage
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[CleanupService] Service arrêté");
    }
  }

  /**
   * Supprime les messages expirés de la BDD
   * @returns {Promise<number>} Nombre de messages supprimés
   */
  async cleanup() {
    if (this.isRunning) {
      console.log("[CleanupService] Nettoyage déjà en cours, ignoré");
      return 0;
    }

    this.isRunning = true;
    const now = new Date();

    try {
      const result = await Message.deleteMany({
        ephemeral: true,
        expiresAt: { $lte: now },
      });

      if (result.deletedCount > 0) {
        console.log(
          `[CleanupService] ${result.deletedCount} message(s) éphémère(s) supprimé(s)`,
        );
      }

      return result.deletedCount;
    } catch (error) {
      console.error("[CleanupService] Erreur lors du nettoyage:", error);
      return 0;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Supprime un message éphémère spécifique
   * @param {string} messageId - ID du message à supprimer
   */
  async deleteMessage(messageId) {
    try {
      const result = await Message.deleteOne({
        _id: messageId,
        ephemeral: true,
      });
      return result.deletedCount > 0;
    } catch (error) {
      console.error(
        "[CleanupService] Erreur lors de la suppression du message:",
        error,
      );
      return false;
    }
  }

  /**
   * Récupère les messages éphémères encore valides
   * @param {string} roomId - ID du salon
   * @returns {Promise<Array>} Liste des messages éphémères valides
   */
  async getEphemeralMessages(roomId) {
    const now = new Date();
    return Message.find({
      room: roomId,
      ephemeral: true,
      expiresAt: { $gt: now },
    }).sort({ createdAt: -1 });
  }
}

// Export une instance singleton
module.exports = new CleanupService();
