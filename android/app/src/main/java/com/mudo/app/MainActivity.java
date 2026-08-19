package com.mudo.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.mudo.app.gallery.GalleryPlugin;
import com.mudo.app.clipboard.ClipboardPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins locales (no vienen de npm): hay que registrarlos a mano
        registerPlugin(GalleryPlugin.class);
        registerPlugin(ClipboardPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
