package com.mudo.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.mudo.app.gallery.GalleryPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin local (no viene de npm): hay que registrarlo a mano
        registerPlugin(GalleryPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
