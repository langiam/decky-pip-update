import {
    Router,
    WindowRouter,
    getGamepadNavigationTrees,
} from "@decky/ui";
import isEqual from "lodash/isEqual";
import { useEffect, useState } from "react";

import { useGlobalState } from "./globalState";
import { intersectRectangles } from "./geometry";
import { UIComposition, useUIComposition } from "./useUIComposition";
import { PICTURE_HEIGHT, PICTURE_WIDTH, Position, SCREEN_HEIGHT, SCREEN_WIDTH, ViewMode } from "./util";

interface BrowserProps {
    url: string
    visible: boolean
    x: number
    y: number
    width: number
    height: number
}

const Browser = ({ url, visible, x, y, width, height }: BrowserProps) => {
    useUIComposition(UIComposition.Notification);

    const [{ browser, view }] = useState<{ browser: any, view: any }>(() => {
        const root: (WindowRouter & any) | undefined =
            Router.WindowStore?.GamepadUIMainWindowInstance;

        if (!root || typeof root.CreateBrowserView !== "function") {
            const noOp = () => {};
            const fakeView = {
                LoadURL: noOp,
                Destroy: noOp,
                GetBrowser: () => ({
                    SetVisible: noOp,
                    SetBounds: noOp,
                }),
            } as any;

            console.error("[decky-pip] GamepadUIMainWindowInstance/CreateBrowserView not available");

            return {
                view: fakeView,
                browser: fakeView.GetBrowser(),
            };
        }

        const view = root.CreateBrowserView("pip");
        const browser = view.GetBrowser();

        (window as any).pip = view;

        return {
            view,
            browser,
        };
    });

    useEffect(() => {
        browser.SetVisible(visible);
    }, [visible]);

    useEffect(() => {
        view.LoadURL(url);
    }, [url]);

    useEffect(() => {
        browser.SetBounds(x, y, width, height);
    }, [x, y, width, height]);

    useEffect(() => {
        return () => view.Destroy();
    }, []);

    return null;
}

const getBounds = (document: any) => {
    return {
        x: document?.defaultView?.screenLeft,
        y: document?.defaultView?.screenTop,
        width: document?.defaultView?.outerWidth,
        height: document?.defaultView?.outerHeight,
    };
}

const getDeckComponentBounds = () => {
    const trees = (typeof getGamepadNavigationTrees === "function"
        ? getGamepadNavigationTrees()
        : []) as any[];

    const findWindow = (match: (id: string) => boolean) => {
        const tree = trees.find(
            (t: any) => typeof t?.id === "string" && match(t.id)
        );
        return tree?.m_Root?.m_element?.ownerDocument?.defaultView ?? null;
    };

   
    const navWindow = findWindow(
        id => id === "MainNavMenuContainer" || id.includes("MainNav")
    );
    const qamWindow = findWindow(
        id => id === "QuickAccess-NA" || id.includes("QuickAccess")
    );
    const virtualKeyboardWindow = findWindow(
        id => id.toLowerCase().includes("keyboard")
    );

    const navHidden = navWindow?.document.hidden;
    const navBounds = navHidden ? null : getBounds(navWindow?.document);

    const qamHidden = qamWindow?.document.hidden;
    const qamBounds = qamHidden ? null : getBounds(qamWindow?.document);

    // VIRTUAL KEYBOARD (still a guess, based on its screen area)
    const virtualKeyboardHidden = !virtualKeyboardWindow;
    const virtualKeyboardBounds = virtualKeyboardHidden
        ? null
        : {
            x: 0,
            y: SCREEN_HEIGHT - 240,
            width: SCREEN_WIDTH,
            height: 240,
        };

    return {
        nav: navBounds,
        qam: qamBounds,
        virtualKeyboard: virtualKeyboardBounds,
    };
};

const useDeckComponentBounds = () => {
    const [state, setState] = useState(getDeckComponentBounds());

    useEffect(() => {
        const interval = setInterval(() => {
            setState(current => {
                const next = getDeckComponentBounds();
                return isEqual(next, current)
                    ? current
                    : next;
            });
        }, 500);

        return () => clearInterval(interval);
    }, []);

    return state;
}

export const Pip = () => {
    const { nav, qam, virtualKeyboard } = useDeckComponentBounds();
    const [{ viewMode, position, size, url, visible, ...settings }] = useGlobalState();

    const overlayOpen = !!nav || !!qam || !!virtualKeyboard;
    const effectiveVisible = visible && !overlayOpen;

    const pictureWidth = PICTURE_WIDTH * size;
    const pictureHeight = PICTURE_HEIGHT * size;

    const availableBounds = [{
        x: 0,
        y: 0,
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT
    }];

    if (nav) {
        availableBounds.push({
            x: nav.width,
            y: 0,
            width: SCREEN_WIDTH - nav.width,
            height: SCREEN_HEIGHT
        });
    }

    if (qam) {
        availableBounds.push({
            x: 0,
            y: 0,
            width: SCREEN_WIDTH - qam.width,
            height: SCREEN_HEIGHT
        });
    }

    if (virtualKeyboard) {
        availableBounds.push({
            x: 0,
            y: 0,
            width: SCREEN_WIDTH,
            height: SCREEN_HEIGHT - virtualKeyboard.height
        });
    }

    const bounds = intersectRectangles(availableBounds) ?? {
        x: 0,
        y: 0,
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT
    };

    const margin = viewMode == ViewMode.Expand
        ? 30
        : settings.margin;

    bounds.x += margin;
    bounds.y += margin;
    bounds.width -= margin * 2;
    bounds.height -= margin * 2;

    switch (viewMode) {
        case ViewMode.Expand: {
            // do nothing, screen is calculated initially to fullscreen
        } break;

        case ViewMode.Picture: {
            switch (position) {
                case Position.Top: {
                    bounds.x += bounds.width / 2 - pictureWidth / 2;
                } break;
                case Position.TopRight: {
                    bounds.x += bounds.width - pictureWidth;
                } break;
                case Position.Right: {
                    bounds.x += bounds.width - pictureWidth;
                    bounds.y += bounds.height / 2 - pictureHeight / 2;
                } break;
                case Position.BottomRight: {
                    bounds.x += bounds.width - pictureWidth;
                    bounds.y += bounds.height - pictureHeight;
                } break;
                case Position.Bottom: {
                    bounds.x += bounds.width / 2 - pictureWidth / 2;
                    bounds.y += bounds.height - pictureHeight;
                } break;
                case Position.BottomLeft: {
                    bounds.y += bounds.height - pictureHeight;
                } break;
                case Position.Left: {
                    bounds.y += bounds.height / 2 - pictureHeight / 2;
                } break;
                case Position.TopLeft: {
                    // do nothing, screen is calculated initially to top left
                } break;
            }

            bounds.width = pictureWidth;
            bounds.height = pictureHeight;
        } break;
    }

    return <Browser
        url={url}
        visible={effectiveVisible}
        {...bounds} />;
}

export const PipOuter = () => {
    const [{ viewMode }] = useGlobalState();

    if (viewMode == ViewMode.Closed) {
        return null;
    }

    return <Pip />;
}