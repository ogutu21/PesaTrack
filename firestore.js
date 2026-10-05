// =====================================================
// PESATRACK FIRESTORE MODULE
// =====================================================


// =====================================================
// FIREBASE APP
// =====================================================

import {
    initializeApp,
    getApps
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";


// =====================================================
// FIRESTORE
// =====================================================

import {
    getFirestore,
    doc,
    setDoc,
    deleteDoc,
    collection,
    getDocs,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


// =====================================================
// FIREBASE CONFIGURATION
// =====================================================

const firebaseConfig = {

    apiKey:
        "AIzaSyATQUO_8h29Ki8rF-AaPb3cQ7RyD3HLLCw",

    authDomain:
        "pesatrack-92632.firebaseapp.com",

    projectId:
        "pesatrack-92632",

    storageBucket:
        "pesatrack-92632.firebasestorage.app",

    messagingSenderId:
        "227171165751",

    appId:
        "1:227171165751:web:255aea2c6618dfdce981b2",

    measurementId:
        "G-SL0RL58835"

};


// =====================================================
// INITIALIZE FIREBASE
// =====================================================

const firebaseApp =
    getApps().length > 0
        ? getApps()[0]
        : initializeApp(firebaseConfig);


// =====================================================
// INITIALIZE FIRESTORE
// =====================================================

const db =
    getFirestore(firebaseApp);


// =====================================================
// SAVE ONE TRANSACTION
// =====================================================

async function saveTransactionToFirestore(
    userId,
    transaction
) {

    if (!userId) {

        console.error(
            "Firestore: User ID is missing."
        );

        return false;

    }


    if (!transaction || !transaction.id) {

        console.error(
            "Firestore: Invalid transaction."
        );

        return false;

    }


    try {

        const transactionReference =
            doc(
                db,
                "users",
                userId,
                "transactions",
                String(transaction.id)
            );


        await setDoc(
            transactionReference,
            {
                id:
                    String(transaction.id),

                description:
                    transaction.description || "",

                amount:
                    Number(transaction.amount) || 0,

                type:
                    transaction.type || "expense",

                category:
                    transaction.category || "Other",

                date:
                    transaction.date || "",

                createdAt:
                    transaction.createdAt ||
                    new Date().toISOString()

            }
        );


        console.log(
            "Transaction saved to Firestore:",
            transaction.id
        );


        return true;

    } catch (error) {

        console.error(
            "Firestore save error:",
            error
        );


        return false;

    }

}


// =====================================================
// UPDATE ONE TRANSACTION
// =====================================================

async function updateTransactionInFirestore(
    userId,
    transaction
) {

    return saveTransactionToFirestore(
        userId,
        transaction
    );

}


// =====================================================
// DELETE ONE TRANSACTION
// =====================================================

async function deleteTransactionFromFirestore(
    userId,
    transactionId
) {

    if (!userId || !transactionId) {

        console.error(
            "Firestore: Missing user ID or transaction ID."
        );

        return false;

    }


    try {

        const transactionReference =
            doc(
                db,
                "users",
                userId,
                "transactions",
                String(transactionId)
            );


        await deleteDoc(
            transactionReference
        );


        console.log(
            "Transaction deleted from Firestore:",
            transactionId
        );


        return true;

    } catch (error) {

        console.error(
            "Firestore delete error:",
            error
        );


        return false;

    }

}


// =====================================================
// LOAD ALL TRANSACTIONS
// =====================================================

async function loadTransactionsFromFirestore(
    userId
) {

    if (!userId) {

        console.error(
            "Firestore: User ID is missing."
        );

        return [];

    }


    try {

        const transactionsReference =
            collection(
                db,
                "users",
                userId,
                "transactions"
            );


        const snapshot =
            await getDocs(
                transactionsReference
            );


        const transactions = [];


        snapshot.forEach(
            documentSnapshot => {

                transactions.push(
                    documentSnapshot.data()
                );

            }
        );


        console.log(
            "Transactions loaded from Firestore:",
            transactions.length
        );


        return transactions;

    } catch (error) {

        console.error(
            "Firestore load error:",
            error
        );


        return [];

    }

}


// =====================================================
// CLEAR ALL TRANSACTIONS
// =====================================================

async function clearFirestoreTransactions(
    userId
) {

    if (!userId) {

        console.error(
            "Firestore: User ID is missing."
        );

        return false;

    }


    try {

        const transactionsReference =
            collection(
                db,
                "users",
                userId,
                "transactions"
            );


        const snapshot =
            await getDocs(
                transactionsReference
            );


        if (snapshot.empty) {

            console.log(
                "Firestore: No transactions to delete."
            );

            return true;

        }


        const batch =
            writeBatch(db);


        snapshot.forEach(
            documentSnapshot => {

                batch.delete(
                    documentSnapshot.ref
                );

            }
        );


        await batch.commit();


        console.log(
            "All Firestore transactions deleted."
        );


        return true;

    } catch (error) {

        console.error(
            "Firestore clear error:",
            error
        );


        return false;

    }

}


// =====================================================
// EXPORT FUNCTIONS
// =====================================================

export {

    db,

    saveTransactionToFirestore,

    updateTransactionInFirestore,

    deleteTransactionFromFirestore,

    loadTransactionsFromFirestore,

    clearFirestoreTransactions

};


// =====================================================
// MODULE LOADED
// =====================================================

console.log(
    "PesaTrack Firestore module loaded successfully."
);

console.log(
    "Firestore transaction functions are ready."
);