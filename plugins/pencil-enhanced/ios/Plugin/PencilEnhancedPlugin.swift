import Foundation
import Capacitor
import UIKit
import PencilKit
import Vision

@objc(PencilEnhancedPlugin)
public class PencilEnhancedPlugin: CAPPlugin, UIPencilInteractionDelegate {
    private var pencilInteraction: UIPencilInteraction?
    private weak var handwritingVC: HandwritingSessionViewController?
    private var activeHandwritingCall: CAPPluginCall?

    public override func load() {
        super.load()
        DispatchQueue.main.async { [weak self] in
            self?.installPencilInteractionIfNeeded()
        }
    }

    deinit {
        if let ix = pencilInteraction, let view = bridge?.viewController?.view {
            view.removeInteraction(ix)
        }
    }

    private func installPencilInteractionIfNeeded() {
        guard pencilInteraction == nil else { return }
        guard let view = bridge?.viewController?.view else { return }
        let ix = UIPencilInteraction()
        ix.delegate = self
        view.addInteraction(ix)
        pencilInteraction = ix
    }

    // MARK: - CAPPlugin API

    @objc func isAvailable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let isPad = UIDevice.current.userInterfaceIdiom == .pad
            call.resolve([
                "available": isPad,
                "platform": "ios",
                "features": [
                    "doubleTap": true,
                    "handwritingModal": true,
                    "squeeze": self.squeezeSupported(),
                ],
            ])
        }
    }

    @objc func startHandwritingSession(_ call: CAPPluginCall) {
        let locale = call.getString("locale") ?? "en-US"
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard let presenter = self.bridge?.viewController else {
                call.reject("missing_view_controller")
                return
            }
            if self.handwritingVC != nil || self.activeHandwritingCall != nil {
                call.reject("session_already_active")
                return
            }
            call.keepAlive = true
            self.activeHandwritingCall = call

            let vc = HandwritingSessionViewController(localeId: locale)
            self.handwritingVC = vc
            vc.modalPresentationStyle = .pageSheet
            if let sheet = vc.sheetPresentationController {
                sheet.detents = [.large()]
                sheet.prefersGrabberVisible = true
            }
            vc.onFinish = { [weak self] result in
                guard let self = self else { return }
                self.handwritingVC = nil
                guard let capCall = self.activeHandwritingCall else { return }
                self.activeHandwritingCall = nil
                switch result {
                case .committed(let text):
                    capCall.resolve(["text": text])
                case .cancelled:
                    capCall.reject("canceled")
                }
            }
            presenter.present(vc, animated: true, completion: nil)
        }
    }

    @objc func cancelHandwritingSession(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if let vc = self.handwritingVC {
                vc.dismiss(animated: true) {
                    self.handwritingVC = nil
                    if let cap = self.activeHandwritingCall {
                        self.activeHandwritingCall = nil
                        cap.reject("canceled")
                    }
                    call.resolve()
                }
            } else {
                if let cap = self.activeHandwritingCall {
                    self.activeHandwritingCall = nil
                    cap.reject("canceled")
                }
                call.resolve()
            }
        }
    }

    @objc func recognizeInkImage(_ call: CAPPluginCall) {
        let raw = call.getString("imageBase64") ?? ""
        let locale = call.getString("locale") ?? "en-US"
        guard !raw.isEmpty else {
            call.resolve(["text": ""])
            return
        }

        guard let imageData = decodeBase64Image(raw) else {
            call.reject("invalid_image_base64")
            return
        }
        guard let image = UIImage(data: imageData), let cgImage = image.cgImage else {
            call.reject("invalid_image_data")
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            request.recognitionLanguages = [locale]

            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            do {
                try handler.perform([request])
            } catch {
                DispatchQueue.main.async {
                    call.resolve(["text": ""])
                }
                return
            }

            let observations = request.results as? [VNRecognizedTextObservation] ?? []
            let lines = observations.compactMap { $0.topCandidates(1).first?.string }
            let text = lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            DispatchQueue.main.async {
                call.resolve(["text": text])
            }
        }
    }

    // MARK: - UIPencilInteractionDelegate

    public func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
        // System double-tap preference is not always exposed on `UIPencilInteraction`; keep raw tap events only.
        notifyListeners("pencilDoubleTap", data: ["preferredAction": -1])
    }

    private func squeezeSupported() -> Bool {
        false
    }

    private func decodeBase64Image(_ input: String) -> Data? {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if let commaIdx = trimmed.firstIndex(of: ",") {
            let encoded = String(trimmed[trimmed.index(after: commaIdx)...])
            return Data(base64Encoded: encoded)
        }
        return Data(base64Encoded: trimmed)
    }
}
