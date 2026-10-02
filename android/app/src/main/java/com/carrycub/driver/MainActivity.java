package com.carrycub.driver;

import android.app.KeyguardManager;
import android.content.Context;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onResume() {
        super.onResume();
        // Phone unlock hai aur app khuli hai -> ring band.
        // Lock screen par ho to ring chalti rahegi (unlock hone par RingService khud band karti hai).
        KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        if (km == null || !km.isKeyguardLocked()) {
            RingService.stop(this);
        }
    }
}
