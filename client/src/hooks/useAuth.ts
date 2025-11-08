import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { ExternalProvider } from "@ethersproject/providers";
import { auth } from "../firebase/config";
import axios from "axios";
import { ethers } from "ethers";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useDispatch } from "react-redux";
import { setUser } from "../state";

declare global {
  interface Window {
    ethereum: ExternalProvider;
  }
}

const METAMASK_BACKEND_URL = "http://localhost:3001/metamask";
const CLIENT_URL = "http://localhost:3000";

export const useAuth = () => {
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleGoogleAuth = async () => {
    try {
      // First, sign in with Google
      const provider = new GoogleAuthProvider();
      console.log("Google Auth Provider initialized");
      provider.setCustomParameters({
        prompt: "select_account",
      });

      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      const user = result.user;

      if (!token) {
        toast.error("Failed to get authentication token");
        return;
      }

      console.log("Google sign-in successful:", user);

      // After Google sign-in, request wallet connection
      if (window.ethereum && typeof window.ethereum.request !== "undefined") {
        try {
          const [userAddress] = await window.ethereum.request({
            method: "eth_requestAccounts",
          });
          setIsWalletConnected(true);
          const address = ethers.utils.getAddress(userAddress);

          dispatch(
            setUser({
              user: {
                name: user.displayName || "User",
                avatar:
                  user.photoURL ||
                  "https://cdn-icons-png.flaticon.com/128/3177/3177440.png",
                walletAddress: address,
              },
              token: token,
            })
          );

          toast.success("Successfully authenticated with Google and MetaMask!");
          navigate("/home");
        } catch (walletError) {
          console.error("Wallet connection failed:", walletError);
          toast.error("Failed to connect wallet. Please try again.");
          
          // Still save user without wallet
          dispatch(
            setUser({
              user: {
                name: user.displayName || "User",
                avatar:
                  user.photoURL ||
                  "https://cdn-icons-png.flaticon.com/128/3177/3177440.png",
                // walletAddress: null,
              },
              token: token,
            })
          );
          navigate("/home");
        }
      } else {
        toast.warn(
          "MetaMask is not installed. Continuing without wallet connection.",
          {
            position: "top-right",
            autoClose: 5000,
            theme: "colored",
          }
        );

        // Save user without wallet
        dispatch(
          setUser({
            user: {
              name: user.displayName || "User",
              avatar:
                user.photoURL ||
                "https://cdn-icons-png.flaticon.com/128/3177/3177440.png",
              // walletAddress: null,
            },
            token: token,
          })
        );
        navigate("/home");
      }
    } catch (err: any) {
      console.error("Google authentication failed:", err);
      const errorCode = err.code;
      const errorMessage = err.message;

      if (errorCode === "auth/popup-closed-by-user") {
        toast.info("Sign-in was cancelled");
      } else if (errorCode === "auth/network-request-failed") {
        toast.error("Network error. Please check your connection.");
      } else {
        toast.error(`Authentication failed: ${errorMessage}`);
      }
    }
  };

  const connectWallet = async (): Promise<void> => {
    try {
      if (window.ethereum && typeof window.ethereum.request !== "undefined") {
        const [userAddress] = await window.ethereum.request({
          method: "eth_requestAccounts",
        });
        setIsWalletConnected(true);
        const address = ethers.utils.getAddress(userAddress);
        await handleMetaMaskLogin(address);
      } else {
        toast.warn(
          "MetaMask is not installed. Please install MetaMask to sign-up successfully.",
          {
            position: "top-right",
            autoClose: 5000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            progress: undefined,
            theme: "colored",
            className: "toast-custom",
          }
        );
      }
    } catch (err) {
      console.error("Failed to connect MetaMask and login:", err);
      toast.error("Failed to connect wallet. Please try again.");
    }
  };

  const getSiweMessage = async (address: string): Promise<string | void> => {
    try {
      const response = await axios.post(
        `${METAMASK_BACKEND_URL}/message`,
        {
          address,
          domain: window.location.hostname || "localhost",
          uri: window.location.origin || CLIENT_URL,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (err: any) {
      toast.error("Failed to authenticate with MetaMask. Please try again.", {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
        className: "toast-custom",
      });
      if (err.response) console.error(err.response.data);
      else console.error("Error fetching SIWE message:", err.message);
    }
  };

  const signMessage = async (message: string): Promise<string | void> => {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const signature = await signer.signMessage(message);

      return signature;
    } catch (error) {
      console.error("Failed to sign message:", error);
      toast.error("Failed to sign message. Please try again.");
    }
  };

  const verifySignature = async (
    address: string,
    message: string,
    signature: string
  ): Promise<void> => {
    try {
      const response = await axios.post(`${METAMASK_BACKEND_URL}/verify`, {
        message,
        signature,
      });
      if (response.data.success) {
        toast.success("Successfully authenticated with MetaMask!");
        dispatch(
          setUser({
            user: {
              name: "Anonymous",
              walletAddress: address, // Changed from 'address' to 'walletAddress' for consistency
              avatar: "https://cdn-icons-png.flaticon.com/128/10/10960.png",
            },
            token: "jadfkklakssl", // Consider using a proper token from backend
          })
        );
        setTimeout(() => {
          navigate("/home");
        }, 2000);
      } else {
        toast.error("Authentication failed!");
      }
    } catch (error) {
      console.error("Verification failed:", error);
      toast.error("Verification failed. Please try again.");
    }
  };

  const handleMetaMaskLogin = async (address: string) => {
    try {
      const message = await getSiweMessage(address);
      if (!message) {
        throw new Error("Message generation failed");
      }
      const signature = await signMessage(message);
      if (!signature) {
        throw new Error("Signature is required");
      }
      await verifySignature(address, message, signature);
    } catch (error) {
      console.error("Login failed:", error);
      toast.error("MetaMask login failed. Please try again.");
    }
  };

  return { handleGoogleAuth, connectWallet, isWalletConnected };
};