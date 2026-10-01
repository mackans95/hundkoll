package se.hundkoll.app;

import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Without this Android finishes the activity on every back gesture.
        // Back walks the WebView's history (SvelteKit navigations included)
        // and leaves the app only from the first page.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = bridge.getWebView();
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    moveTaskToBack(true);
                }
            }
        });
    }

    @Override
    public void onPause() {
        super.onPause();
        // The WebView writes cookies to disk on a timer. A swipe-away before
        // it fires loses a just-rotated Supabase refresh token, and replaying
        // the old one revokes the whole session.
        CookieManager.getInstance().flush();
    }
}
