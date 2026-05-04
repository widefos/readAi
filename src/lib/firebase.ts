import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export async function signIn() {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error: any) {
    if (error.code === 'auth/popup-blocked') {
      alert("登录窗口被浏览器拦截了，请在浏览器地址栏右侧点击『允许弹出窗口』后重试。");
    } else if (error.code === 'auth/cancelled-popup-request') {
      console.warn("Popup request was cancelled by multiple clicks or page refresh.");
    } else {
      console.error("Sign in error:", error);
      alert(`登录失败: ${error.message}`);
    }
    throw error;
  }
}

// Removed premature connection test to prevent noise before auth
