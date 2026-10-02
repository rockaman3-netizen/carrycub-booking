package com.carrycub.driver;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Capacitor push plugin ki service ko extend karta hai.
 * - "booking_assigned" message aaye to lambi ring shuru karta hai.
 * - Baaki sab messages (aur token refresh) plugin ke normal tareeke se chalte hain.
 */
public class DriverMessagingService extends MessagingService {

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String type = data != null ? data.get("type") : null;

        if ("booking_assigned".equals(type)) {
            String title = data.get("title");
            String body = data.get("body");

            if ((title == null || title.isEmpty()) && remoteMessage.getNotification() != null) {
                title = remoteMessage.getNotification().getTitle();
            }
            if ((body == null || body.isEmpty()) && remoteMessage.getNotification() != null) {
                body = remoteMessage.getNotification().getBody();
            }

            RingService.start(getApplicationContext(), title, body);
            return;
        }

        super.onMessageReceived(remoteMessage);
    }
}
