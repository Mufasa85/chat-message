import { useState, useRef, useCallback } from 'react';

/**
 * useScreenShare — Partage d'écran pendant un appel vidéo
 *
 * Gère le remplacement temporaire du flux vidéo (caméra) par un flux
 * de capture d'écran (getDisplayMedia), puis rétablit la caméra
 * quand le partage s'arrête.
 *
 * Usage :
 *   const { isSharing, startScreenShare, stopScreenShare } = useScreenShare({
 *     peerConnection,
 *     localVideoRef,
 *   });
 */
export const useScreenShare = ({ peerConnection, localVideoRef }) => {
  const [isSharing, setIsSharing] = useState(false);
  const screenStreamRef = useRef(null);
  const originalVideoTrackRef = useRef(null);

  const startScreenShare = useCallback(async () => {
    if (!peerConnection) return;
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false,
      });

      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];

      const sender = peerConnection
        .getSenders()
        .find((s) => s.track?.kind === 'video');

      if (sender) {
        originalVideoTrackRef.current = sender.track;
        await sender.replaceTrack(screenTrack);
      }

      if (localVideoRef?.current) {
        localVideoRef.current.srcObject = screenStream;
      }

      screenTrack.onended = () => stopScreenShare();

      setIsSharing(true);
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        console.error('[ScreenShare] Erreur:', err.message);
      }
    }
  }, [peerConnection, localVideoRef]);

  const stopScreenShare = useCallback(async () => {
    if (!peerConnection || !screenStreamRef.current) return;
    try {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;

      if (originalVideoTrackRef.current) {
        const sender = peerConnection
          .getSenders()
          .find((s) => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(originalVideoTrackRef.current);
        }

        if (localVideoRef?.current) {
          const cameraStream = new MediaStream([originalVideoTrackRef.current]);
          localVideoRef.current.srcObject = cameraStream;
        }

        originalVideoTrackRef.current = null;
      }

      setIsSharing(false);
    } catch (err) {
      console.error('[ScreenShare] Erreur arrêt:', err.message);
    }
  }, [peerConnection, localVideoRef]);

  return { isSharing, startScreenShare, stopScreenShare };
};
