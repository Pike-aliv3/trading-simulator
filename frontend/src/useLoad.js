import { useEffect, useState } from 'react';

// Runs loader() whenever deps change and returns { data, error, loading }.
// Errors are kept so they can be shown, and a late response for old deps
// is ignored. Old data stays visible while reloading.
export function useLoad(loader, deps) {
    const [state, setState] = useState({ data: null, error: null, loading: true });

    useEffect(() => {
        let cancelled = false;
        setState((s) => ({ data: s.data, error: null, loading: true }));
        loader()
            .then((data) => { if (!cancelled) setState({ data, error: null, loading: false }); })
            .catch((err) => { if (!cancelled) setState({ data: null, error: err.message, loading: false }); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    return state;
}
